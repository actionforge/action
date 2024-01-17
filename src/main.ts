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
 * Extracts the contents of an archive file to a directory.
 * @param archivePath The path to the archive file.
 * @returns A Promise that resolves to the path of the extracted directory.
 */
export async function extractArchive(archivePath: string): Promise<string> {
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
async function downloadRunner(info: IRunnerVersionInfo): Promise<string> {
  const token = core.getInput("token");
  if (!token) {
      throw new Error(`No GitHub token found`)
  }

  const tempDir = process.env.RUNNER_TEMP || '.';
  const filename = path.join(tempDir, info.filename);

  const pipeline = util.promisify(stream.pipeline);
  await pipeline(
    got.stream(info.downloadUrl, {
      method: "GET",
      headers: {
        "User-Agent": "GitHub Actions",
        Accept: "application/octet-stream",
        Authorization: `token ${token}`,
      },
    }),
    fs.createWriteStream(filename)
  );

  const extPath = await extractArchive(filename);
  const execPath = path.join(extPath, info.filename);
  fs.chmodSync(execPath, 0o755);

  const hash = await calculateFileHash(execPath);
  if (hash.length !== 64 || hash !== pj.binaries[os.platform()]) {
    throw new Error(`Hash mismatch for ${execPath}`);
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

  const customEnv = { ...process.env, GRAPH_FILE: graphFile };
  cp.execSync(`${runnerPath} run`, { stdio: "inherit", env: customEnv });
}

/**
 * The main function that downloads and installs the runner.
 */
async function run(): Promise<void> {
  const baseUrl = `https://github.com/actionforge/${pj.name}/releases/download`;
  const downloadUrl = `${baseUrl}/v${pj.version}/graph-runner-${os.platform()}-${os.arch()}.tar.gz`;
  console.log("Downloading runner from", downloadUrl);

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

  const runnerPath = await downloadRunner(downloadInfo);
  return executeRunner(runnerPath, graphFile);
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
