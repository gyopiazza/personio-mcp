import { PersonioApiError } from "../client.js";

export function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function errorContent(err: unknown) {
  const message =
    err instanceof PersonioApiError || err instanceof Error
      ? err.message
      : String(err);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function imageContent(data: ArrayBuffer, mimeType: string) {
  return {
    content: [
      {
        type: "image" as const,
        data: Buffer.from(data).toString("base64"),
        mimeType,
      },
    ],
  };
}
