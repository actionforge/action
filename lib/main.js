"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractArchive = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const stream = __importStar(require("stream"));
const util = __importStar(require("util"));
const tc = __importStar(require("@actions/tool-cache"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const got_1 = __importDefault(require("got"));
const child_process_1 = __importDefault(require("child_process"));
const bundled_package_json_1 = __importDefault(require("./bundled_package.json"));
/**
 * Extracts the contents of an archive file to a directory.
 * @param archivePath The path to the archive file.
 * @returns A Promise that resolves to the path of the extracted directory.
 */
function extractArchive(archivePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const platform = os_1.default.platform();
        return platform === "win32"
            ? tc.extractZip(archivePath)
            : tc.extractTar(archivePath);
    });
}
exports.extractArchive = extractArchive;
/**
 * Downloads the specified runner version and returns the path to the executable.
 * @param info - The runner version information.
 * @returns The path to the executable.
 */
function downloadRunner(info) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = core.getInput("token");
        if (!token) {
            throw new Error(`No GitHub token found`);
        }
        // Windows requires that we keep the extension (.zip) for extraction
        const isWindows = os_1.default.platform() === 'win32';
        const tempDir = process.env.RUNNER_TEMP || '.';
        const fileName = path_1.default.join(tempDir, info.fileName);
        const pipeline = util.promisify(stream.pipeline);
        yield pipeline(got_1.default.stream(info.downloadUrl, {
            method: "GET",
            headers: {
                "User-Agent": "GitHub Actions",
                Accept: "application/octet-stream",
                Authorization: `token ${token}`,
            },
        }), fs_1.default.createWriteStream(fileName));
        const extPath = yield extractArchive(fileName);
        const execPath = path_1.default.join(extPath, info.fileName);
        fs_1.default.chmodSync(execPath, 0o755);
        return execPath;
    });
}
/**
 * Executes a runner with the specified runnerPath and sets up the required environment variables.
 * @param runnerPath - The path to the runner to execute.
 * @returns A Promise that resolves when the runner has finished executing.
 */
function executeRunner(runnerPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = core.getInput("token");
        const GRAPH_FILE_DIR = ".github/workflows/graphs";
        const graphFile = path_1.default.join(GRAPH_FILE_DIR, core.getInput("graph_file", { required: true }));
        const octokit = github.getOctokit(token);
        const { data } = yield octokit.rest.repos.getContent({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            ref: github.context.sha,
            path: graphFile,
        });
        fs_1.default.mkdirSync(path_1.default.dirname(graphFile), { recursive: true });
        const buf = Buffer.from(data.content, "base64");
        fs_1.default.writeFileSync(graphFile, buf.toString("utf-8"));
        const customEnv = Object.assign(Object.assign({}, process.env), { GRAPH_FILE: graphFile });
        child_process_1.default.execSync(runnerPath, { stdio: "inherit", env: customEnv });
    });
}
/**
 * The main function that downloads and installs the runner.
 */
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const baseUrl = `https://github.com/actionforge/${bundled_package_json_1.default.name}/releases/download`;
        const downloadUrl = `${baseUrl}/v${bundled_package_json_1.default.version}/graph-runner-${os_1.default.platform()}-${os_1.default.arch()}-${bundled_package_json_1.default.version}.tar.gz`;
        console.log(`Downloading runner from ${downloadUrl}`);
        const downloadInfo = {
            downloadUrl: downloadUrl,
            resolvedVersion: bundled_package_json_1.default.version,
            fileName: 'graph-runner',
        };
        const runnerPath = yield downloadRunner(downloadInfo);
        executeRunner(runnerPath);
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield run();
        }
        catch (error) {
            if (error instanceof Error)
                core.setFailed(error.message);
            return process.exit(1);
        }
    });
}
main();
//# sourceMappingURL=main.js.map