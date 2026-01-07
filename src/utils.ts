import * as path from "path";
import fs from "fs";
import { createHash } from "crypto";

export const SUPPORTED_PLATFORMS = [
  { os: "linux", arch: "x64", ext: "tar.gz", key: "linux-x64" },
  { os: "linux", arch: "arm64", ext: "tar.gz", key: "linux-arm64" },
  { os: "macos", arch: "x64", ext: "pkg", key: "darwin-x64" },
  { os: "macos", arch: "arm64", ext: "pkg", key: "darwin-arm64" },
  { os: "windows", arch: "x64", ext: "zip", key: "win32-x64" },
  { os: "windows", arch: "arm64", ext: "zip", key: "win32-arm64" }
];

function findFileRecursive(dir: string, fileName: string): string | null {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findFileRecursive(fullPath, fileName);
      if (found) return found;
    } else if (file === fileName) {
      return fullPath;
    }
  }
  return null;
}

export function getDownloadUrl(version: string, os: string, arch: string, ext: string, baseUrl?: string): { downloadUrl: string; filename: string } {
  const filename = `actrun-v${version}.cli-${arch}-${os}.${ext}`;
  const root = baseUrl?.replace(/\/$/, "") || `https://github.com/actionforge/actrun-cli/releases/download/v${version}`;
  return {
    downloadUrl: `${root}/${filename}`,
    filename
  };
}

export function getBinaryInternalPath(platform: string, extractedPath: string): string | null {
  if (platform === "darwin" || platform === "macos") {
    const foundPath = findFileRecursive(extractedPath, "actrun");
    if (foundPath) {
      return foundPath;
    }
  } else if (platform === "win32" || platform === "windows") {
    return path.join(extractedPath, "actrun.exe");
  }
  return path.join(extractedPath, "actrun");
}

export function getErrorMessage(e: unknown): string {
    if (e instanceof Error) {
        return e.message;
    }

    if (typeof e === 'object' && e !== null) {
        const errorObj = e as Record<string, unknown>;

        if (errorObj.error && typeof errorObj.error === 'object') {
            return getErrorMessage(errorObj.error);
        }
        
        if (typeof errorObj.message === 'string') {
            return errorObj.message;
        }
    }

    if (typeof e === 'string') {
        return e;
    }

    return "Unknown error";
}

export async function calculateHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const hash = createHash("sha256");
      const stream = fs.createReadStream(filePath);
      
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}