const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const cheerio = require('cheerio');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
};

const BASE = 'https://www.shop-husqvarna.ro';

async function scrape(code) {
  // Cauta produsul
  const sRes  = await fetch(`${BASE}/catalogsearch/result/?q=${encodeURIComponent(code)}`, { headers: HEADERS, timeout: 20000 });
  const sHtml = await sRes.text();
  const $s    = cheerio.load(sHtml);

  let productUrl = null;
  const sels = ['a.product-item-link', '.product-item-info a', '.product-item a[href*=".html"]'];
  for (const sel of sels) {
    const href = $s(sel).first().attr('href');
    if (href) { productUrl = href; break; }
  }
  if (!productUrl) {
    // Cauta orice link .html din domeniu
    $s('a[href]').each((_, el) => {
      const h = $s(el).attr('href') || '';
      if (!productUrl && h.includes('shop-husqvarna.ro') && h.endsWith('.html')) productUrl = h;
    });
  }
  if (!productUrl) throw new Error(`Produsul cu codul "${code}" nu a fost gasit`);

  // Pagina produsului
  const pRes  = await fetch(productUrl, { headers: HEADERS, timeout: 20000 });
  const pHtml = await pRes.text();
  const $     = cheerio.load(pHtml);

  // Nume
  let name = '';
  for (const sel of ['h1.page-title span', 'h1.page-title', '.product-info-main h1', '[itemprop="name"]']) {
    name = $(sel).first().text().trim();
    if (name) break;
  }

  // Preturi
  let price = '', oldPrice = '', isOffer = false;
  const sp = $('.special-price .price, [data-price-type="finalPrice"] .price').first().text().trim();
  const rp = $('.old-price .price, [data-price-type="oldPrice"] .price').first().text().trim();
  const pp = $('.price-box .price, .product-info-price .price').first().text().trim();
  if (sp && rp) { price = sp; oldPrice = rp; isOffer = true; }
  else if (sp)  { price = sp; }
  else          { price = pp; }
  price    = price.replace(/\s+/g, ' ').trim();
  oldPrice = oldPrice.replace(/\s+/g, ' ').trim();

  // Descriere
  const sd = $('.product.attribute.short-description .value, [itemprop="description"]').first().text().trim();
  const fd = $('#description .value, .product.attribute.description .value').first().text().trim();
  let specs = '';
  $('#product-attribute-specs-table tr, .product.data.items .table-wrapper tr').each((_, row) => {
    const th = $(row).find('th').text().trim();
    const td = $(row).find('td').text().trim();
    if (th && td) specs += `${th}: ${td}. `;
  });
  const desc = [sd, fd, specs].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').substring(0, 600);

  // Imagine
  let imageUrl = '';
  for (const sel of ['.gallery-placeholder img', '.fotorama__img', '.product-image-photo']) {
    const src = $(sel).first().attr('src') || '';
    if (src && !src.includes('placeholder')) { imageUrl = src; break; }
  }

  return {
    name:      name || `Produs ${code}`,
    price:     price || 'Pret indisponibil',
    oldPrice:  oldPrice || null,
    offer:     isOffer,
    desc:      desc || '',
    imageUrl:  imageUrl || null,
    inStock:   !$('.stock.unavailable, .out-of-stock').length,
    sourceUrl: productUrl,
    sku:       $('[itemprop="sku"]').first().text().trim() || code,
  };
}

app.get('/product', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ success: false, error: 'Cod lipsa' });
  try {
    const data = await scrape(code.trim());
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Proxy pornit pe portul ${PORT}`));
