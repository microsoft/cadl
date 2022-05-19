// @ts-check
import { execSync } from "child_process";
import https from "https";

const AZP_USERID = "azure-pipelines[bot]";
const TRYID_COMMENT_IDENTIFIER = "_CADL_TRYIT_COMMENT_";
main().catch((e) => {
  console.error(e);
  // @ts-ignore
  process.exit(1);
});

/**
 * Retrieve github authentication header from the git config.
 * MUST have `persistCredentials: true` in the checkout step.
 */
function getGithubAuthHeader(repo) {
  const stdout = execSync(`git config --get http.https://github.com/${repo}.extraheader`)
    .toString()
    .trim();
  const authHeader = stdout.split(": ")[1];
  return authHeader;
}

async function main() {
  const folderName = process.argv.length > 2 ? `/${process.argv[2]}` : "";
  const repo = process.env["BUILD_REPOSITORY_ID"];
  const prNumber = process.env["SYSTEM_PULLREQUEST_PULLREQUESTNUMBER"];
  const ghAuth = getGithubAuthHeader(repo);

  console.log("Looking for comments in", { repo, prNumber });
  const data = await listComments(repo, prNumber, ghAuth);
  const azoComments = data.filter((x) => x.user?.login === AZP_USERID);
  console.log(`Found ${azoComments.length} comment(s) from Azure Pipelines.`);

  const tryItComments = data.filter((x) => x.body.includes(TRYID_COMMENT_IDENTIFIER));
  console.log(`Found ${azoComments.length} Cadl Try It comment(s)`);
  if (tryItComments.length > 0) {
    console.log("##vso[task.setvariable variable=SKIP_COMMENT;]true");
    return;
  }

  const comment = `<!-- ${TRYID_COMMENT_IDENTIFIER} -->\nYou can try these changes at https://cadlplayground.z22.web.core.windows.net${folderName}/prs/${prNumber}/`;
  await writeComment(repo, prNumber, comment, ghAuth);
}

async function listComments(repo, prNumber, ghAuth) {
  const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments?per_page=100`;
  const result = await request("GET", url, { ghAuth });
  return JSON.parse(result);
}

async function writeComment(repo, prNumber, comment, ghAuth) {
  const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
  const body = {
    body: comment,
  };
  const headers = {
    "Content-Type": "application/json",
  };

  const response = await request("POST", url, {
    headers,
    body: JSON.stringify(body),
    ghAuth,
  });

  console.log("Comment created", response);
}

async function request(method, url, data) {
  const lib = https;
  const value = new URL(url);

  const params = {
    method,
    host: value.host,
    port: 443,
    path: value.pathname,
    headers: {
      "User-Agent": "nodejs",
      ...data.headers,
    },
  };

  console.log("Params", params);

  params.headers.Authorization = data.ghAuth;

  return new Promise((resolve, reject) => {
    const req = lib.request(params, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`Status Code: ${res.statusCode}`));
      }

      const data = [];

      res.on("data", (chunk) => {
        data.push(chunk);
      });

      res.on("end", () => resolve(Buffer.concat(data).toString()));
    });

    req.on("error", reject);

    if (data.body) {
      req.write(data.body);
    }

    req.end();
  });
}
