const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const cheerio = require('cheerio');
 
const app  = express();
const PORT = process.env.PORT || 3001;
 
app.use(cors({ origin: '*' }));
 
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
};
 
const BASE = 'https://www.shop-husqvarna.ro';
 
async function scrapeUrl(productUrl) {
  console.log('[Scraper] URL:', productUrl);
  const res  = await fetch(productUrl, { headers: HEADERS, timeout: 20000 });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const $    = cheerio.load(html);
 
  let name = '';
  for (const sel of ['h1.page-title span','h1.page-title','.product-info-main h1','[itemprop="name"]','h1']) {
    name = $(sel).first().text().trim();
    if (name) break;
  }
 
  let price = '', oldPrice = '', isOffer = false;
  const sp = $('.special-price .price, [data-price-type="finalPrice"] .price').first().text().trim();
  const rp = $('.old-price .price, [data-price-type="oldPrice"] .price, .regular-price .price').first().text().trim();
  const pp = $('.price-box .price, .product-info-price .price').first().text().trim();
  if (sp && rp) { price = sp; oldPrice = rp; isOffer = true; }
  else if (sp)  { price = sp; }
  else          { price = pp; }
  price    = price.replace(/\s+/g,' ').trim();
  oldPrice = oldPrice.replace(/\s+/g,' ').trim();
 
  const sd = $('.product.attribute.short-description .value, [itemprop="description"]').first().text().trim();
  const fd = $('#description .value, .product.attribute.description .value').first().text().trim();
  let specs = '';
  $('#product-attribute-specs-table tr, .additional-attributes tr').each((_,row) => {
    const th = $(row).find('th,.label').text().trim();
    const td = $(row).find('td,.data').text().trim();
    if (th && td) specs += th + ': ' + td + '. ';
  });
  const desc = [sd,fd,specs].filter(Boolean).join(' ').replace(/\s{2,}/g,' ').substring(0,600);
 
  let imageUrl = '';
  for (const sel of ['.gallery-placeholder img','.fotorama__img','.product-image-photo']) {
    const src = $(sel).first().attr('src') || $(sel).first().attr('data-src') || '';
    if (src && src.startsWith('http') && !src.includes('placeholder')) { imageUrl = src; break; }
  }
 
  const sku = $('[itemprop="sku"],.product.attribute.sku .value').first().text().trim() || '';
  if (!name) throw new Error('Nu s-au putut extrage datele produsului.');
 
  return { name, price: price||'Pret indisponibil', oldPrice: oldPrice||null, offer: isOffer, desc: desc||'', imageUrl: imageUrl||null, inStock: !$('.stock.unavailable,.out-of-stock').length, sourceUrl: productUrl, sku };
}
 
async function scrapeByCode(code) {
  const sRes  = await fetch(BASE + '/catalogsearch/result/?q=' + encodeURIComponent(code), { headers: HEADERS, timeout: 20000 });
  const sHtml = await sRes.text();
  const $s    = cheerio.load(sHtml);
  let productUrl = null;
  for (const sel of ['a.product-item-link','.product-item-info a.product-item-link','.product-item a[href*=".html"]']) {
    const href = $s(sel).first().attr('href');
    if (href) { productUrl = href; break; }
  }
  if (!productUrl) {
    $s('a[href]').each((_,el) => {
      const h = $s(el).attr('href')||'';
      if (!productUrl && h.includes('shop-husqvarna.ro') && h.endsWith('.html')) productUrl = h;
    });
  }
  if (!productUrl) throw new Error('Codul "' + code + '" nu a fost gasit.');
  return scrapeUrl(productUrl);
}
 
app.get('/product', async (req, res) => {
  const { code, url } = req.query;
  if (!code && !url) return res.status(400).json({ success:false, error:'Parametrul code sau url este necesar.' });
  try {
    const data = url ? await scrapeUrl(decodeURIComponent(url)) : await scrapeByCode(code.trim());
    res.json({ success:true, data });
  } catch(err) {
    res.status(500).json({ success:false, error:err.message });
  }
});
 
app.get('/health', (_,res) => res.json({ status:'ok', version:'2.0' }));
app.listen(PORT, () => console.log('Husqvarna Proxy v2.0 pornit pe portul ' + PORT));
