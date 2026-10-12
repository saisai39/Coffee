
const GITHUB_OWNER = "saisai39";
const GITHUB_REPO = "Coffee";
const GITHUB_BRANCH = "feature/admin-panel";

const ALLOWED_ORIGIN = "https://saisai39.github.io";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ error: "許可されていないアクセスです。" }, 403, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "POST のみ対応しています。" }, 405, origin);
    }

    if (!env.GITHUB_TOKEN) {
      return jsonResponse({ error: "サーバー設定が不足しています。" }, 500, origin);
    }

    try {
      const body = await request.json();
      const { path, content, message } = body;

      if (
        typeof path !== "string" ||
        !/^images\/[a-zA-Z0-9._/-]+$/.test(path) ||
        path.includes("..") ||
        !/\.(png|jpe?g|webp|gif)$/i.test(path) ||
        typeof content !== "string" ||
        typeof message !== "string"
      ) {
        return jsonResponse({ error: "入力内容が正しくありません。" }, 400, origin);
      }

      const binary = atob(content);
      if (binary.length > 5 * 1024 * 1024) {
        return jsonResponse({ error: "画像は5MB以下にしてください。" }, 413, origin);
      }

      const apiUrl =
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

      const headers = {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "Coffee-Guide-Admin",
      };

      const existingResponse = await fetch(
        `${apiUrl}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
        { headers }
      );

      let sha;
      if (existingResponse.ok) {
        const existing = await existingResponse.json();
        sha = existing.sha;
      } else if (existingResponse.status !== 404) {
        return jsonResponse({ error: "GitHub上の画像を確認できませんでした。" }, 502, origin);
      }

      const uploadResponse = await fetch(apiUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: message.slice(0, 120),
          content,
          branch: GITHUB_BRANCH,
          ...(sha ? { sha } : {}),
        }),
      });

      if (!uploadResponse.ok) {
        return jsonResponse({ error: "GitHubへの保存に失敗しました。" }, 502, origin);
      }

      const result = await uploadResponse.json();

      return jsonResponse({
        success: true,
        path: result.content?.path,
        commit: result.commit?.sha,
      }, 200, origin);
    } catch {
      return jsonResponse({ error: "リクエストを処理できませんでした。" }, 400, origin);
    }
  },
};
