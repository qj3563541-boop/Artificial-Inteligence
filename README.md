# Riphah GramVision - Deployment Guide / سرور پر لائیو کرنے کا طریقہ

یہ فولڈر مکمل طور پر تیار اور self-contained ہے (کسی Node.js یا build step کی ضرورت نہیں ہے)۔ آپ اس فولڈر یا اس کے اندر موجود تمام فائلوں کو کسی بھی ویب سرور پر اپلوڈ کر کے فوراً لائیو کر سکتے ہیں۔

This folder is completely standalone and self-contained (zero npm build or backend needed). You can upload it to any web hosting or server to go live immediately.

---

## 📁 اس فولڈر کی فائلیں (Files in this folder):
1. **`index.html`** - ویب سائٹ کا مین پیج (Main HTML entry point)
2. **`style.css`** - تمام اسٹائلز، ریسپانسو لے آؤٹ، اور سینٹرڈ پاپ اپ (CSS Styles with centered popup)
3. **`app.js`** - امیج پراسیسنگ اور مائکروسکوپی اینالیسس انجن (Image processing & analytics logic)
4. **`riphah-logo.png`** - رفاہ انٹرنیشنل یونیورسٹی کا آفیشل ہائی ریزولوشن لوگو (High-res university crest logo)

---

## 🚀 کسی بھی سرور پر لائیو کرنے کے آسان طریقے (How to deploy):

### 1. cPanel / Shared Hosting (Hostinger, Bluehost, Namecheap, etc.):
- اپنے cPanel کے **File Manager** میں جائیں۔
- `public_html` فولڈر کھولیں۔
- اس `Qasim` فولڈر کے اندر موجود 4 فائلیں (`index.html`, `style.css`, `app.js`, `riphah-logo.png`) اپلوڈ کر دیں (یا `public_html/qasim/` کے اندر اپلوڈ کریں)۔
- آپ کی ویب سائٹ فوری طور پر لائیو ہو جائے گی!

### 2. Netlify / Vercel:
- **Netlify Drop**: [app.netlify.com/drop](https://app.netlify.com/drop) پر جائیں اور `Qasim` کا پورا فولڈر ڈریگ اینڈ ڈراپ کر دیں۔ 5 سیکنڈ میں فری لائیو لنک مل جائے گا۔
- **Vercel**: `vercel deploy` کمانڈ رن کریں یا گٹ ہب کے ذریعے کنیکٹ کریں۔

### 3. GitHub Pages:
- گٹ ہب ریپو میں یہ فائلیں اپلوڈ کریں اور سیٹنگز میں جا کر **GitHub Pages** ان ایبل کر دیں۔

### 4. Apache / Nginx / VPS Server:
- فائلوں کو سرور کی ویب روٹ ڈائریکٹری میں کاپی کریں:
  - Apache: `/var/www/html/`
  - Nginx: `/usr/share/nginx/html/`
- اجازت نامے سیٹ کریں: `chmod 755 *`
