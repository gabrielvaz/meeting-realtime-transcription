import type { NextConfig } from "next";

/**
 * Dois alvos a partir do mesmo código.
 *
 * - Padrão (`npm run build`): aplicação Next completa, com o Route Handler que
 *   guarda a chave no servidor.
 * - `STATIC_EXPORT=1` (GitHub Pages): export estático. Não existe servidor,
 *   então o Route Handler precisa sair do build — e ele sai porque
 *   `pageExtensions` deixa de reconhecer o sufixo `.server.ts`. Nesse alvo a
 *   aplicação depende da chave do próprio usuário e cria o client secret
 *   direto no navegador.
 */
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  pageExtensions: staticExport ? ["ts", "tsx"] : ["server.ts", "ts", "tsx"],
  // O cliente precisa saber que não existe servidor para consultar.
  env: { NEXT_PUBLIC_STATIC_EXPORT: staticExport ? "1" : "" },
  ...(staticExport
    ? {
        output: "export",
        // Project page: https://<usuário>.github.io/<repo>/
        basePath: process.env.PAGES_BASE_PATH ?? "/meeting-realtime-transcription",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
