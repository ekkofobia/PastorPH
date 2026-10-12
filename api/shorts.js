// Função serverless da Vercel: GET /api/shorts
// Lê o feed de vídeos do canal, mantém só os que são Shorts e devolve os 3 mais recentes.

const CHANNEL_ID = "UCtPtu_Wke2THlMWaqiKcsfw";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function decodeEntities(texto) {
  return (texto || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

// Um Short abre direto em /shorts/ID (200). Um vídeo comum redireciona para /watch (3xx).
async function ehShort(id) {
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, { redirect: "manual" });
    return r.status === 200;
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  try {
    const feed = await fetch(FEED_URL);
    if (!feed.ok) throw new Error(`feed respondeu ${feed.status}`);
    const xml = await feed.text();

    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .map((m) => {
        const bloco = m[1];
        const id = (bloco.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
        const titulo = (bloco.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
        return { id, title: decodeEntities(titulo) };
      })
      .filter((v) => v.id)
      .slice(0, 15); // o feed traz os ~15 uploads mais recentes, em ordem de data

    // Verifica em paralelo quais são Shorts e mantém a ordem (mais recente primeiro)
    const resultados = await Promise.all(videos.map((v) => ehShort(v.id)));
    const shorts = videos.filter((_, i) => resultados[i]).slice(0, 3);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // Cache na borda da Vercel por 15 minutos: não consulta o YouTube a cada visita
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    res.end(JSON.stringify({ items: shorts }));
  } catch (erro) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ items: [], erro: String(erro.message || erro) }));
  }
};
