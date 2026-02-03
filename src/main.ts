import * as core from "@actions/core";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import os from "os";
import path from "path";
import fs from "fs";
import cp from "child_process";

import { getDownloadUrl, getBinaryInternalPath, calculateHash } from "./utils";

import * as pjson from './../package.json';
import * as bundled_package from './bundled_package.json';

const version = (pjson as Record<string, unknown>).version as string;
const binaries = (bundled_package as Record<string, unknown>).binaries as Record<string, string>;

export interface IRunnerVersionInfo {
  downloadUrl: string;
  filename: string;
}

export async function extractArchive(archivePath: string, originalFilename: string): Promise<string> {
  if (originalFilename.endsWith(".tar.gz")) {
    return await tc.extractTar(archivePath);
  } else if (originalFilename.endsWith(".zip")) {
    return await tc.extractZip(archivePath);
  } else if (originalFilename.endsWith(".pkg")) {
    const dest = path.join(path.dirname(archivePath), "expanded-pkg");
    cp.execSync(`pkgutil --expand-full "${archivePath}" "${dest}"`);
    return dest;
  } else {
    throw new Error(`Unsupported archive format: ${originalFilename}`);
  }
}

async function downloadRunner(info: IRunnerVersionInfo, token: string | null): Promise<string> {
  core.info(`📥 Downloading runner from: ${info.downloadUrl}`);

  const archivePath = await tc.downloadTool(
    info.downloadUrl,
    undefined,
    token ? `token ${token}` : undefined
  );

  const platform = os.platform(); 
  const arch = os.arch();         
  const platformKey = `${platform}-${arch}`;
  
  core.info(`📦 Extracting archive: ${info.filename}`);
  const extractedPath = await extractArchive(archivePath, info.filename);
  
  const binPath: string | null = getBinaryInternalPath(os.platform(), extractedPath);
  if (!binPath) {
    throw new Error(`failed to locate binary in extracted path: ${extractedPath}`);
  }

  const expectedHash = binaries[platformKey];
  if (expectedHash) {
    core.info(`🔍 Verifying SHA-256 checksum for binary: ${platformKey}...`);
    const actualHash = await calculateHash(binPath);

    if (actualHash !== expectedHash) {
      throw new Error(
        `Checksum mismatch for binary ${platformKey}!\n` +
        `Expected: ${expectedHash}\n` +
        `Actual:   ${actualHash}`
      );
    }
    core.info("✅ Binary checksum verified.");
  } else {
    core.warning(`⚠️ No expected hash found for ${platformKey} in bundled_package.json. Skipping check.`);
  }

  if (os.platform() !== "win32") {
    fs.chmodSync(binPath, 0o755);
  }

  return binPath;
}

async function executeRunner(
  githubToken: string,
  runnerPath: string,
  graphFile: string,
  sessionToken: string,
  inputs: string,
  matrix: string,
  secrets: string,
  needs: string,
  createDebugSession: boolean
): Promise<void> {
  const isAct = process.env.ACT === "true";

  if (!isAct) {
    core.info(`🔍 Fetching graph file from repository: ${graphFile}`);
    const octokit = github.getOctokit(githubToken);

    try {
        const { data } = await octokit.rest.repos.getContent({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          ref: github.context.sha,
          path: graphFile,
        });

        const buf = Buffer.from((data as { content: string }).content, "base64");
        const dir = path.dirname(graphFile);
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(graphFile, buf.toString("utf-8"));
    } catch (err) {
        core.error(`Failed to fetch or write graph file: ${graphFile}`);
        throw err;
    }
  }

  const customEnv = {
    ...process.env,
    ACT_GRAPH_FILE: graphFile,
    ACT_SESSION_TOKEN: sessionToken,
    INPUT_INPUTS: inputs,
    INPUT_SECRETS: secrets,
    INPUT_MATRIX: matrix,
    INPUT_NEEDS: needs,
    INPUT_TOKEN: githubToken,
    ACT_CREATE_DEBUG_SESSION: createDebugSession ? "true" : undefined,
  };

  core.info(`🚀 Executing runner: ${runnerPath}`);
  try {
    if (createDebugSession) {
      runnerPath = runnerPath + " --create_debug_session=true";
    }
    cp.execSync(runnerPath, { stdio: "inherit", env: customEnv });
    core.info(`✅ Runner execution completed successfully.`);
  } catch (err) {
    core.error(`❌ Runner execution failed.`);
    throw err;
  }
}

function assertValidString(o?: string | null): string {
  return (o === null || o === undefined || o === "" || o === "null" || o === "{}") ? "" : o;
}

// Helper to support both hyphen (new) and underscore (legacy) input names
function getInputCompat(name: string, options?: core.InputOptions): string {
  const value = core.getInput(name, options);
  if (value) return value;
  const underscoreName = name.replace(/-/g, "_");
  return core.getInput(underscoreName, options);
}

function getBooleanInputCompat(name: string, options?: core.InputOptions): boolean {
  const value = core.getInput(name, options);
  if (value) return core.getBooleanInput(name, options);
  const underscoreName = name.replace(/-/g, "_");
  return core.getBooleanInput(underscoreName, options);
}

async function run(): Promise<void> {
  let runnerPath: string = getInputCompat("runner-path", { trimWhitespace: true });
  const sessionToken: string = getInputCompat("session-token", { trimWhitespace: true });
  const runnerBaseUrl: string = getInputCompat("runner-base-url", { trimWhitespace: true });
  const inputs: string = assertValidString(core.getInput("inputs"));
  const matrix: string = assertValidString(core.getInput("matrix"));
  const secrets: string = assertValidString(core.getInput("secrets"));
  const needs: string = assertValidString(core.getInput("needs"));
  const createDebugSession: boolean = getBooleanInputCompat("create-debug-session", { trimWhitespace: true });

  const githubToken = getInputCompat("github-token", { trimWhitespace: true });
  if (!githubToken) throw new Error(`No GitHub token found`);

  const GRAPH_FILE_DIR = ".github/workflows/graphs";
  let graphFile = path.join(GRAPH_FILE_DIR, getInputCompat("graph-file", { required: true }));
  if (os.platform() === "win32") graphFile = graphFile.replace(/\\/g, "/");

  const sha = process.env.GITHUB_SHA;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  
  core.info(`--------------------------------`);
  core.info(`🟢 View Action Graph: https://app.actionforge.dev/github/${repo}/${sha}/${graphFile}?run_id=${runId}`);
  core.info(`--------------------------------`);

  if (!runnerPath) {
    const platform = os.platform();
    const arch = os.arch();
    
    let ext = "tar.gz";
    let platformName = platform.toString();

    if (platform === "darwin") {
        ext = "pkg";
        platformName = "macos";
    } else if (platform === "win32") {
        ext = "zip";
        platformName = "windows";
    }

    const res = getDownloadUrl(version, platformName, arch, ext, runnerBaseUrl);
    runnerPath = await downloadRunner(res, runnerBaseUrl ? null : githubToken);
  }

  return executeRunner(githubToken, runnerPath, graphFile, sessionToken, inputs, matrix, secrets, needs, createDebugSession);
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
    process.exit(1);
  }
}

void main();