import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScript } from "./test-loader.mjs";

const attachments = loadTypeScript(new URL("./attachments.ts", import.meta.url));
const { translate } = loadTypeScript(new URL("../i18n/translate.ts", import.meta.url));
const { en } = loadTypeScript(new URL("../i18n/messages/en.ts", import.meta.url));
const { de } = loadTypeScript(new URL("../i18n/messages/de.ts", import.meta.url));

test("arbitrary and extensionless files remain files rather than being rejected or decoded", () => {
  for (const file of [
    new File(["archive"], "project.zip", { type: "application/zip" }),
    new File(["document"], "report.pdf", { type: "application/pdf" }),
    new File(["source"], "main.ts", { type: "text/plain" }),
    new File(["binary"], "LICENSE"),
  ]) {
    assert.equal(attachments.classify(file), "file", file.name);
  }
  assert.equal(attachments.classify(new File(["image"], "photo.png", { type: "image/png" })), "image");
});

test("upload limits reject oversized originals of every format and retain the exact boundary", () => {
  assert.equal(typeof attachments.prepareUploads, "function");
  const result = attachments.prepareUploads([
    new File(["12345"], "accepted.zip"),
    new File(["123456"], "large.txt", { type: "text/plain" }),
    new File(["123456"], "large.png", { type: "image/png" }),
    new File([], "empty.bin"),
  ], { maxBytes: 5, maxFiles: 8 }, 0);

  assert.deepEqual(result.files.map((file) => file.name), ["accepted.zip"]);
  assert.deepEqual(result.errors.map((error) => [error.code, error.details.filename]), [
    ["file_too_large", "large.txt"],
    ["file_too_large", "large.png"],
    ["empty_file", "empty.bin"],
  ]);
});

test("upload selection respects attachments already in the composer", () => {
  assert.equal(typeof attachments.prepareUploads, "function");
  const result = attachments.prepareUploads([
    new File(["a"], "first.zip"),
    new File(["b"], "second.pdf"),
  ], { maxBytes: 10, maxFiles: 2 }, 1);
  assert.deepEqual(result.files.map((file) => file.name), ["first.zip"]);
  assert.equal(result.errors[0].code, "too_many_files");
  assert.equal(result.errors[0].details.max_files, 2);
});

test("uploaded references exclude legacy text IDs and do not duplicate inline file content", () => {
  assert.equal(typeof attachments.uploadedAttachmentIds, "function");
  const files = [
    { id: "a".repeat(32), kind: "file", name: "project.zip", mediaType: "application/zip", bytes: 12 },
    { id: "b".repeat(32), kind: "image", name: "image.png", mediaType: "image/png", bytes: 12, path: "/uploads/image.png" },
    { id: "c".repeat(32), kind: "text", name: "old.txt", mediaType: "text/plain", bytes: 3, text: "old" },
    { id: "draft-id", kind: "file", name: "draft.bin", mediaType: "application/octet-stream", bytes: 2 },
  ];
  assert.deepEqual(attachments.uploadedAttachmentIds(files), ["a".repeat(32), "b".repeat(32)]);
  const block = attachments.attachmentBlock(files);
  assert.ok(block.includes("old.txt"));
  assert.ok(block.includes("old"));
  assert.ok(!block.includes("project.zip"));
  assert.ok(!block.includes("image.png"));
  assert.ok(!block.includes("draft.bin"));
});

test("structured size and authentication errors use the active locale instead of server messages", () => {
  assert.equal(typeof attachments.UploadError, "function");
  assert.equal(typeof attachments.uploadErrorMessage, "function");
  const tooLarge = new attachments.UploadError("file_too_large", { filename: "project.zip", max_bytes: 20_000_000 });
  assert.equal(attachments.uploadErrorMessage(tooLarge, (key, vars) => translate(de, key, vars)), "project.zip ist größer als 20.0 MB");
  assert.equal(attachments.uploadErrorMessage(tooLarge, (key, vars) => translate(en, key, vars)), "project.zip is larger than 20.0 MB");
  const unauthorized = new attachments.UploadError("unauthorized");
  assert.equal(attachments.uploadErrorMessage(unauthorized, (key, vars) => translate(de, key, vars)), "Bitte melde dich an, um Dateien hochzuladen.");
  assert.equal(attachments.uploadErrorMessage(new Error("private server details"), (key, vars) => translate(en, key, vars)), "Upload failed.");
});

test("multipart uploads retain binary and complete text originals and use returned image metadata", async (t) => {
  const binary = new Uint8Array([0, 255, 3, 128]);
  const text = "a".repeat(15_000) + "tail";
  let received;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    // Real Web APIs serialize and parse the multipart body at the HTTP boundary.
    received = (await new Response(options.body).formData()).getAll("files");
    return Response.json({ files: [
      { id: "1".repeat(32), filename: "project.zip", media_type: "application/zip", bytes: 4, path: "/uploads/1.zip" },
      { id: "2".repeat(32), filename: "source.ts", media_type: "text/plain", bytes: 15_004, path: "/uploads/2.ts" },
      { id: "3".repeat(32), filename: "photo.png", media_type: "image/png", bytes: 4, path: "/uploads/3.png" },
    ] });
  });
  const uploaded = await attachments.uploadFiles([
    new File([binary], "project.zip", { type: "application/zip" }),
    new File([text], "source.ts", { type: "text/plain" }),
    new File([binary], "photo.png"),
  ]);
  assert.deepEqual(new Uint8Array(await received[0].arrayBuffer()), binary);
  assert.equal(await received[1].text(), text);
  assert.deepEqual(received.map((file) => file.name), ["project.zip", "source.ts", "photo.png"]);
  assert.deepEqual(uploaded.map((file) => file.kind), ["file", "file", "image"]);
  assert.ok(uploaded.every((file) => file.text === undefined && !file.truncated));
  assert.equal(attachments.downloadUrl(uploaded[0]), "/api/uploads/11111111111111111111111111111111");
  assert.equal(attachments.previewUrl(uploaded[0]), null);
  assert.equal(attachments.previewUrl(uploaded[2]), "/api/uploads/33333333333333333333333333333333");
});

test("server validation failures retain stable codes and details instead of raw English messages", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: {
      code: "file_too_large",
      message: "English backend details",
      details: { filename: "project.zip", max_bytes: 25 },
    },
  }, { status: 413 }));
  await assert.rejects(attachments.uploadFiles([new File(["archive"], "project.zip")]), (error) => {
    assert.ok(error instanceof attachments.UploadError);
    assert.equal(error.code, "file_too_large");
    assert.deepEqual(error.details, { filename: "project.zip", max_bytes: 25 });
    assert.equal(attachments.uploadErrorMessage(error, (key, vars) => translate(de, key, vars)), "project.zip ist größer als 25 B");
    return true;
  });
});
