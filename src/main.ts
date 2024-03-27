import * as core from "@actions/core";
import * as github from "@actions/github";
import * as stream from "stream";
import * as util from "util";
import * as crypto from "crypto";
import * as tc from "@actions/tool-cache";
import * as pjdata from './bundled_package.json';

import os from "os";
import path from "path";
import fs from "fs";
import got from "got";
import cp from "child_process";

const pj: BundledPackage = pjdata as unknown as BundledPackage;

const StepDebug = "ACTIONS_STEP_DEBUG";
const IS_DEBUG = process.env[StepDebug] === "true";

type BundledPackage = {
  name: string;
  version: string;
  binaries: Record<NodeJS.Platform, string>;
};

/**
 * Represents information about a runner version,
 * including its download URL, resolved version, and file name.
 */
export interface IRunnerVersionInfo {
  downloadUrl: string;
  filename: string;
}

/**
 * Logs a message to the console if debug mode is enabled.
 * @param message The message to log.
 */
function DebugOutput(message: string): void {
  if (IS_DEBUG) {
    console.log(message);
  }
}

/**
 * Extracts the contents of an archive file to a directory.
 * @param archivePath The path to the archive file.
 * @returns A Promise that resolves to the path of the extracted directory.
 */
export async function extractArchive(archivePath: string): Promise<string> {
  DebugOutput(`Extracting archive: ${archivePath}`);
  const platform = os.platform();
  return platform === "win32"
    // Windows requires the .zip extension for extraction
    ? tc.extractZip(archivePath + '.zip')
    : tc.extractTar(archivePath);
}

/**
 * Calculates the SHA256 hash of a file.
 * @param filePath The path to the file.
 * @returns A Promise that resolves to the hash.
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  DebugOutput(`Calculating hash for file: ${filePath}`);
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const s = fs.createReadStream(filePath);

    s.on('data', (data) => hash.update(data));
    s.on('end', () => resolve(hash.digest('hex')));
    s.on('error', (err) => reject(err));
  });
}

/**
 * Downloads the specified runner version and returns the path to the executable.
 * @param info - The runner version information.
 * @returns The path to the executable.
 */
async function downloadRunner(info: IRunnerVersionInfo, token: string | null, hashCheck: boolean): Promise<string> {

  DebugOutput(`Downloading runner from: ${info.downloadUrl}`);

  const tempDir = process.env.RUNNER_TEMP || '.';
  const filename = path.join(tempDir, info.filename);

  const pipeline = util.promisify(stream.pipeline);
  await pipeline(
    got.stream(info.downloadUrl, {
      method: "GET",
      headers: {
        "Accept": "application/octet-stream",
        "User-Agent": "GitHub Actions",
        ...(token ? {
          "Authorization": `token ${token}` } : {}
          ),
      },
    }),
    fs.createWriteStream(filename)
  );

  const extPath = await extractArchive(filename);
  const execPath = path.join(extPath, info.filename);

  DebugOutput(`Changing permissions for: ${execPath} to 0o755`);
  fs.chmodSync(execPath, 0o755);

  if (hashCheck) {
    const hash = await calculateFileHash(execPath);
    if (hash.length !== 64 || hash !== pj.binaries[os.platform()]) {
      throw new Error(`Hash mismatch for ${execPath}`);
    }
  }

  return execPath;
}

/**
 * Executes a runner with the specified runnerPath and sets up the required environment variables.
 * @param runnerPath The path to the runner executable.
 * @param graphFile The path to the graph file.
 * @returns A Promise that resolves when the runner has finished executing.
 */
async function executeRunner(
  runnerPath: string,
  graphFile: string,
  inputs: string,
  matrix: string,
): Promise<void> {
  DebugOutput(`Executing runner: ${runnerPath} with graph file: ${graphFile}`);
  const token = core.getInput("token");

  const octokit = github.getOctokit(token);

  DebugOutput(`Get content with:
    owner: ${github.context.repo.owner},
    repo: ${github.context.repo.repo},
    ref: ${github.context.sha},
    path: ${graphFile}`);

  const { data } = await octokit.rest.repos.getContent({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    ref: github.context.sha,
    path: graphFile,
  });

  fs.mkdirSync(path.dirname(graphFile), { recursive: true });
  const buf = Buffer.from((data as { content: string }).content, "base64");
  fs.writeFileSync(graphFile, buf.toString("utf-8"));

  const customEnv = {
    ...process.env,
    GRAPH_FILE: graphFile,
    INPUT_MATRIX: matrix,
    INPUT_INPUTS: inputs,
  };
  console.log(`🟢 Running graph-runner`, graphFile);
  cp.execSync(`${runnerPath} run`, { stdio: "inherit", env: customEnv });
}

/**
 * Asserts that the given object is an empty or non-empty string.
 */
function assertValidString(o?: string | null): string {
  if (o === null || o === undefined || o === "" || o === "null" || o === "{}") {
    return "";
  } else { 
    return o;
  }
}

/**
 * The main function that downloads and installs the runner.
 */
async function run(): Promise<void> {
  const runnerBaseUrl: string = core.getInput("runner_base_url", { trimWhitespace: true });
  const inputs: string = assertValidString(core.getInput("inputs"));
  const matrix: string = assertValidString(core.getInput("matrix"));

  const token = core.getInput("token");
  if (!token) {
      throw new Error(`No GitHub token found`)
  }

  const baseUrl = `https://github.com/actionforge/${pj.name}/releases/download/v${pj.version}`;
  const downloadUrl = `${runnerBaseUrl.replace(/\/$/, "") || baseUrl}/graph-runner-${os.platform()}-${os.arch()}.tar.gz`;
  if (runnerBaseUrl) {
    console.log("\u27a1 Custom runner URL set:", downloadUrl);
  }

  const downloadInfo = {
    downloadUrl: downloadUrl,
    filename: 'graph-runner',
  };

  const GRAPH_FILE_DIR = ".github/workflows/graphs";
  const graphFile = path.join(
    GRAPH_FILE_DIR,
    core.getInput("graph_file", { required: true })
  );

  // Log output
  const sha = process.env.GITHUB_SHA;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const output = `🟢 View Action Graph: https://www.actionforge.dev/github/${repo}/${sha}/${graphFile}?run_id=${runId}`;
  const delimiter = '-'.repeat(32);
  console.log(`${delimiter}`);
  console.log(output);
  console.log(`${delimiter}`);

  const runnerPath = await downloadRunner(downloadInfo, runnerBaseUrl ? null : token, runnerBaseUrl ? false : true);
  return executeRunner(runnerPath, graphFile, inputs, matrix);
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
    return process.exit(1);
  }
}

void main();
