import handler from "../api/lyrics.ts";

(async () => {
  const req = new Request("http://localhost/api/lyrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Promise", artist: "Jagged Edge" }),
  });

  const res = await handler(req);
  console.log("Status:", res.status);
  console.log("Response:", await res.text());
})();
