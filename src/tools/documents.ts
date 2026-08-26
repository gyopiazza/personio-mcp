import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient } from "../client.js";
import { jsonContent, errorContent } from "./util.js";

export function registerDocumentTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_document_categories",
    {
      title: "List document categories",
      description: "List the company's document categories (needed as category_id for uploads).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonContent(await client.listDocumentCategories());
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_upload_document",
    {
      title: "Upload document",
      description:
        "Upload a document to an employee's profile. Provide either content_text (plain text files like .txt/.csv/.md/.html) or content_base64 for binary formats (pdf, docx, xlsx, images, ...). Max 30MB; rate limited to ~60 uploads/min.",
      inputSchema: z.object({
        title: z.string().max(255).describe("Title of the document."),
        employee_id: z.number().int().positive().describe("Employee ID to attach the document to."),
        category_id: z.number().int().positive().describe("Document category ID (see personio_list_document_categories)."),
        file_name: z.string().min(1).describe("File name including extension, e.g. contract.pdf."),
        content_base64: z
          .string()
          .optional()
          .describe("Base64-encoded file content. Use this for binary formats."),
        content_text: z
          .string()
          .optional()
          .describe("Plain-text file content. Use this for text-based files instead of content_base64."),
        comment: z.string().optional().describe("Optional comment."),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('Optional document date ("yyyy-mm-dd").'),
      }),
    },
    async ({
      title,
      employee_id,
      category_id,
      file_name,
      content_base64,
      content_text,
      comment,
      date,
    }) => {
      try {
        if (!content_base64 && !content_text) {
          return {
            content: [
              { type: "text" as const, text: "Provide either content_base64 or content_text." },
            ],
            isError: true,
          };
        }
        return jsonContent(
          await client.uploadDocument({
            title,
            employee_id,
            category_id,
            fileName: file_name,
            contentBase64: content_base64,
            contentText: content_text,
            contentType: guessMimeType(file_name),
            comment,
            date,
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  json: "application/json",
  zip: "application/zip",
  gz: "application/gzip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function guessMimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return (extension && MIME_BY_EXTENSION[extension]) || "application/octet-stream";
}
