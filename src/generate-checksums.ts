import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as tar from "tar";

import axios from "axios";
import AdmZip from "adm-zip";

import { execSync } from "child_process";
import { finished } from "stream/promises";
import { SUPPORTED_PLATFORMS, getDownloadUrl, getBinaryInternalPath, getErrorMessage } from "./utils";

async function run(): Promise<void> {
  let versionArg = process.argv[2];

  if (!versionArg) {
    console.error("Error: Please provide an argument.\nUsage: npm run generate-checksums v0.10.4");
    process.exit(1);
  }
  if (versionArg.startsWith("v")) {
    versionArg = versionArg.slice(1);
  }

  console.error(`🔍 Generating checksums for version: ${versionArg}`);

  const binaries: Record<string, string> = {};

  for (const p of SUPPORTED_PLATFORMS) {
    const { downloadUrl, filename } = getDownloadUrl(versionArg, p.os, p.arch, p.ext);
    
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `actrun-verify-${p.key}-`));
    const archivePath = path.join(tempDir, filename);
    const extractDir = path.join(tempDir, "extracted");
    fs.mkdirSync(extractDir);

    console.error(`⬇️  Downloading: ${filename}`);

    try {
      const response = await axios({ 
        url: downloadUrl, 
        method: 'GET', 
        responseType: 'stream',
        maxRedirects: 5 
      });

      const writer = fs.createWriteStream(archivePath);
      response.data.pipe(writer);
      await finished(writer); 

      if (p.ext === "tar.gz") {
        tar.x({ file: archivePath, cwd: extractDir, sync: true });
      } else if (p.ext === "zip") {
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(extractDir, true);
      } else if (p.ext === "pkg") {
        const pkgDest = path.join(extractDir, "actrun-cli.pkg");
        execSync(`pkgutil --expand-full "${archivePath}" "${pkgDest}"`);
      }

      const binPath: string | null = getBinaryInternalPath(p.os, extractDir);
      if (!binPath) {
        throw new Error(`failed to locate binary in extracted path: ${extractDir}`);
      }
      
      if (fs.existsSync(binPath)) {
        const fileBuffer = fs.readFileSync(binPath);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        binaries[p.key] = hash;
        console.error(`✅ Verified ${p.key}`);
      } else {
        console.error(`⚠️  Warning: Binary not found at ${binPath} for ${p.key}`);
      }
    } catch (err) {
      console.error(`❌ Failed to process ${p.key}: ${getErrorMessage(err)}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const result = {
    name: "action",
    version: versionArg,
    binaries: binaries
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

run().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});