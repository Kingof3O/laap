export function readFileBase64(file: File): Promise<string> {
  if (file.size > 32 * 1024 * 1024)
    return Promise.reject(new Error("Choose a file up to 32 MiB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      if (typeof reader.result !== "string")
        return reject(new Error("Could not read file."));
      resolve(reader.result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

/** Bound streamed network data before constructing a Blob or crossing native IPC. */
export async function readResponseBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes)
    throw new Error("Response exceeds the transfer size limit.");
  if (!response.body) throw new Error("Empty download response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new Error("Download exceeds the transfer size limit.");
      chunks.push(value);
    }
    if (declared && size !== declared)
      throw new Error("Download was truncated.");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
