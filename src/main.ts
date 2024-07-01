import * as core from "@actions/core";
import * as github from "@actions/github";
import * as stream from "stream";
import * as util from "util";
import * as crypto from "crypto";
import * as tc from "@actions/tool-cache";
import * as pjdata from './bundled_package.json';
import * as pjson from './../package.json';

import os from "os";
import path from "path";
import fs from "fs";
import got from "got";
import cp from "child_process";

const packageJson: Record<string, string> = pjson as unknown as Record<string, string>;
const pj: BundledPackage = pjdata as unknown as BundledPackage;

type BundledPackage = {
  name: string;
  binaries: Record<string, string>;
};

const debugOutput = process.env.ACTIONS_STEP_DEBUG === 'true';

/**
 * Represents information about a runner version,
 * including its download URL, resolved version, and file name.
 */
export interface IRunnerVersionInfo {
  downloadUrl: string;
  filename: string;
}

/**
 * Extracts the contents of an archive file to a directory.
 * @param archivePath The path to the archive file.
 * @returns A Promise that resolves to the path of the extracted directory.
 */
export async function extractArchive(archivePath: string): Promise<string> {
  if (archivePath.endsWith(".tar.gz")) {
    return tc.extractTar(archivePath);
  } else if (archivePath.endsWith(".zip")) {
    return tc.extractZip(archivePath);
  } else {
    throw new Error(`Unsupported archive format: ${archivePath}`);
  }
}

/**
 * Calculates the SHA256 hash of a file.
 * @param filePath The path to the file.
 * @returns A Promise that resolves to the hash.
 */
export async function calculateFileHash(filePath: string): Promise<string> {
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
  const tempDir = process.env.RUNNER_TEMP || '.';
  const zipPath = path.join(tempDir, info.filename + '.zip');
  if (debugOutput) {
    console.log(`📥 Downloaded zip to ${zipPath} from ${info.downloadUrl} 🚀`);
  }

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
    fs.createWriteStream(zipPath)
  );

  const zipDstPath = await extractArchive(zipPath);
  if (debugOutput) {
    console.log(`📦 Extracted runner to ${zipDstPath}`);
  }

  let binPath = path.join(zipDstPath, info.filename);
  if (os.platform() === "linux" || os.platform() === "darwin") {
    fs.chmodSync(binPath, 0o755);
  } else {
    binPath = binPath + ".exe";
  }

  if (hashCheck) {
    const hash = await calculateFileHash(binPath);
    if (hash.length !== 64 || hash !== pj.binaries[`${os.platform()}-${os.arch()}`]) {
      throw new Error(`Hash mismatch for ${binPath}`);
    }
  }

  return binPath;
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
  secrets: string,
): Promise<void> {
  const token = core.getInput("token");

  const octokit = github.getOctokit(token);

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
    ACT_GRAPH_FILE: graphFile, // new env var
    GRAPH_FILE: graphFile, // deprecated env var

    INPUT_MATRIX: matrix,
    INPUT_INPUTS: inputs,
    INPUT_SECRETS: secrets,
  };
  console.log(`🟢 Running graph-runner`, graphFile);
  cp.execSync(runnerPath, { stdio: "inherit", env: customEnv });
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
  let runnerPath: string = core.getInput("runner_path", { trimWhitespace: true });

  const runnerBaseUrl: string = core.getInput("runner_base_url", { trimWhitespace: true });
  const inputs: string = assertValidString(core.getInput("inputs"));
  const matrix: string = assertValidString(core.getInput("matrix"));
  const secrets: string = assertValidString(core.getInput("secrets"));

  const token = core.getInput("token");
  if (!token) {
      throw new Error(`No GitHub token found`)
  }
  
  const GRAPH_FILE_DIR = ".github/workflows/graphs";
  let graphFile = path.join(
    GRAPH_FILE_DIR,
    core.getInput("graph_file", { required: true })
  );
  if (os.platform() === "win32") {
    graphFile = graphFile.replace(/\\/g, "/");
  }

  // Log output
  const sha = process.env.GITHUB_SHA;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const output = `🟢 View Action Graph: https://www.actionforge.dev/github/${repo}/${sha}/${graphFile}?run_id=${runId}`;
  const delimiter = '-'.repeat(32);
  console.log(`${delimiter}`);
  console.log(output);
  console.log(`${delimiter}`);

  if (runnerPath) {
    console.log("\u27a1 Custom runner path set:", runnerPath);
  } else {
    const baseUrl = `https://github.com/actionforge/${pj.name}/releases/download/v${packageJson.version}`;
    const downloadUrl = `${runnerBaseUrl.replace(/\/$/, "") || baseUrl}/graph-runner-${os.platform()}-${os.arch()}.zip`;
    if (runnerBaseUrl) {
      console.log("\u27a1 Custom runner URL set:", downloadUrl);
    }
  
    const downloadInfo = {
      downloadUrl: downloadUrl,
      filename: `graph-runner-${os.platform()}-${os.arch()}`,
    };
  
    runnerPath = await downloadRunner(downloadInfo, runnerBaseUrl ? null : token, runnerBaseUrl ? false : true);
  }

  return executeRunner(runnerPath, graphFile, inputs, matrix, secrets);
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
