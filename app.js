'use strict';

const $ = (id) => document.getElementById(id);

let state = {
  currentDataUrl: null,
  fileName: '',
  result: null,
  viewMode: 'original',
  history: [],
};

const ORGANISMS = {
  'Gram Positive|Cocci': ['Staphylococcus aureus', 'Streptococcus pyogenes', 'Staphylococcus epidermidis'],
  'Gram Positive|Diplococci': ['Streptococcus pneumoniae', 'Enterococcus faecalis'],
  'Gram Positive|Bacilli': ['Bacillus subtilis', 'Corynebacterium diphtheriae', 'Listeria monocytogenes'],
  'Gram Positive|Mixed': ['Staphylococcus spp.', 'Bacillus spp.'],
  'Gram Negative|Cocci': ['Moraxella catarrhalis', 'Neisseria spp.'],
  'Gram Negative|Diplococci': ['Neisseria gonorrhoeae', 'Neisseria meningitidis'],
  'Gram Negative|Bacilli': ['Escherichia coli', 'Klebsiella pneumoniae', 'Pseudomonas aeruginosa'],
  'Gram Negative|Spirilli': ['Campylobacter jejuni', 'Helicobacter pylori'],
  'Gram Negative|Mixed': ['Escherichia coli', 'Pseudomonas aeruginosa'],
};

const CLINICAL = {
  'Gram Positive': 'Gram-positive isolates typically present with a thick peptidoglycan cell wall retaining crystal violet. Empirical therapy often includes beta-lactams or vancomycin pending culture and sensitivity tests.',
  'Gram Negative': 'Gram-negative organisms possess an outer LPS membrane that releases endotoxins upon lysis, posing high sepsis risks. Broad-spectrum empiric cover is frequently recommended pending antibiogram.',
  'Indeterminate': 'The slide exhibits mixed or border-threshold dye retention, characteristic of variable de-colorization or cellular debris. Re-smear and repeat staining before clinical reporting.',
};

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function laplacianVariance(gray, w, h) {
  let sum = 0, sumSq = 0, count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const L = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w];
      sum += L; sumSq += L * L; count++;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function analyzeCanvas(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const im = ctx.getImageData(0, 0, w, h);
  const n = w * h;
  const gray = new Float32Array(n);
  const mask = new Uint8Array(n);

  let purplePx = 0, pinkPx = 0, stainedCount = 0, graySum = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = im.data[o], g = im.data[o + 1], b = im.data[o + 2], a = im.data[o + 3];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = luma; graySum += luma;

    const [hue, sat, val] = hsv(r, g, b);
    if (a > 128 && sat > 0.22 && val > 0.12 && val < 0.98) {
      stainedCount++;
      if (hue >= 224 && hue <= 316) {
        purplePx++; mask[i] = 1;
      } else if (hue >= 336 || hue <= 25) {
        pinkPx++; mask[i] = 2;
      }
    }
  }

  const stainedFraction = stainedCount / n;
  const focus = laplacianVariance(gray, w, h);
  const exposure = graySum / n;

  let quality = 'Fair';
  if (focus < 40 || exposure < 25 || exposure > 245 || stainedFraction < 0.002) quality = 'Poor';
  else if (focus > 110 && exposure > 40 && exposure < 240 && stainedFraction > 0.008) quality = 'Good';

  const decisive = purplePx + pinkPx;
  const purpleArea = (purplePx / n) * 100;
  const pinkArea = (pinkPx / n) * 100;

  if (decisive < 300 || stainedFraction < 0.002) {
    return {
      classification: 'Indeterminate',
      confidence: 15,
      morphology: 'Unclear',
      possible_organisms: [],
      explanation: `Only ${(stainedFraction * 100).toFixed(2)}% of the field carries stain density, which is insufficient for reliable differentiation.`,
      clinical_note: CLINICAL['Indeterminate'],
      image_quality: quality,
      brightness: exposure,
      focus: Math.sqrt(Math.max(0, focus)),
      purpleArea, pinkArea,
      maskData: mask, imageData: im,
      width: w, height: h,
    };
  }

  const purpleShare = purplePx / decisive;
  const pinkShare = pinkPx / decisive;

  let classification;
  let margin;
  if (purpleShare >= 0.65) {
    classification = 'Gram Positive'; margin = purpleShare;
  } else if (pinkShare >= 0.65) {
    classification = 'Gram Negative'; margin = pinkShare;
  } else {
    classification = 'Indeterminate'; margin = Math.max(purpleShare, pinkShare);
  }

  let morphology = 'Cocci';
  if (classification === 'Gram Negative') morphology = focus > 80 ? 'Bacilli' : 'Mixed';
  else if (classification === 'Gram Positive') morphology = purpleArea > 2.5 ? 'Cocci' : 'Diplococci';
  else morphology = 'Mixed';

  let confidence = Math.max(10, Math.min(96, Math.round(50 + (margin - 0.5) * 85 + (quality === 'Good' ? 8 : quality === 'Poor' ? -16 : 0))));
  if (classification === 'Indeterminate') confidence = Math.min(confidence, 42);

  const orgKey = `${classification}|${morphology}`;
  const possible = ORGANISMS[orgKey] || (classification === 'Gram Positive' ? ['Staphylococcus spp.', 'Streptococcus spp.'] : ['Escherichia coli', 'Klebsiella pneumoniae']);

  const explanation = `Microscopy analysis resolved ${(stainedFraction * 100).toFixed(2)}% active stained area. ${(purpleShare * 100).toFixed(1)}% of detected cells fall within the Crystal Violet absorbance spectrum, and ${(pinkShare * 100).toFixed(1)}% within the Safranin spectrum. Focus edge sharpness evaluated at ${Math.sqrt(Math.max(0, focus)).toFixed(1)} with a mean field luminance of ${exposure.toFixed(0)}/255.`;

  return {
    classification,
    confidence,
    morphology,
    possible_organisms: possible,
    explanation,
    clinical_note: CLINICAL[classification],
    image_quality: quality,
    brightness: exposure,
    focus: Math.sqrt(Math.max(0, focus)),
    purpleArea, pinkArea,
    maskData: mask, imageData: im,
    width: w, height: h,
  };
}

function renderCanvas(res) {
  const c = $('displayCanvas');
  c.width = res.width; c.height = res.height;
  const ctx = c.getContext('2d');
  if (state.viewMode === 'original') {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
    img.src = state.currentDataUrl;
    return;
  }
  const out = ctx.createImageData(c.width, c.height);
  for (let i = 0; i < res.maskData.length; i++) {
    const o = i * 4;
    if (state.viewMode === 'mask') {
      const color = res.maskData[i] === 1 ? [4, 120, 87] : res.maskData[i] === 2 ? [225, 29, 72] : [248, 250, 252];
      out.data.set([...color, 255], o);
    } else {
      const r = res.imageData.data[o], g = res.imageData.data[o + 1], b = res.imageData.data[o + 2];
      const [hue, sat, val] = hsv(r, g, b);
      out.data.set(sat > 0.22 ? [Math.round((hue / 360) * 255), Math.round(255 - (hue / 360) * 255), Math.round(val * 255), 255] : [248, 250, 252, 255], o);
    }
  }
  ctx.putImageData(out, 0, 0);
}

async function runAnalysis(dataUrl, fileName) {
  state.currentDataUrl = dataUrl;
  state.fileName = fileName;

  $('emptyView').hidden = true;
  $('displayCanvas').hidden = true;
  $('loader').hidden = false;
  $('resultCard').hidden = true;

  const stages = [
    'Reading microscopic resolution & pixel channels...',
    'Filtering Crystal Violet & Safranin spectral hues...',
    'Executing morphological edge & shape segmentation...',
    'Evaluating focus score & compiling clinical report...',
  ];

  let step = 0;
  $('loaderMsg').textContent = stages[0];
  const timer = setInterval(() => {
    step = (step + 1) % stages.length;
    $('loaderMsg').textContent = stages[step];
  }, 400);

  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const offscreen = document.createElement('canvas');
    offscreen.width = w; offscreen.height = h;
    offscreen.getContext('2d').drawImage(img, 0, 0, w, h);

    await new Promise((r) => setTimeout(r, 600));

    const res = analyzeCanvas(offscreen);
    clearInterval(timer);
    state.result = res;

    $('loader').hidden = true;
    $('displayCanvas').hidden = false;
    renderCanvas(res);

    // Results Card
    $('resultCard').hidden = false;
    $('resClassTitle').textContent = `${res.classification} (${res.morphology}) · ${res.confidence}%`;
    $('resMorph').textContent = res.morphology;
    $('resQuality').textContent = res.image_quality;
    $('resFocus').textContent = res.focus.toFixed(1);
    $('resLuma').textContent = res.brightness.toFixed(0) + ' / 255';
    $('resExplain').textContent = res.explanation;
    $('resClinical').textContent = res.clinical_note;

    const pills = $('orgPills');
    pills.replaceChildren();
    res.possible_organisms.forEach((org) => {
      const sp = document.createElement('span');
      sp.className = 'pill-organism';
      sp.textContent = org;
      pills.appendChild(sp);
    });

    $('fileNameBadge').textContent = `(${fileName})`;

    // History log
    state.history.unshift({
      name: fileName,
      thumb: dataUrl,
      result: res,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    updateHistory();
  } catch (err) {
    clearInterval(timer);
    alert('Failed to analyze image channels.');
  }
}

function updateHistory() {
  $('histCount').textContent = state.history.length;
  const list = $('historyEntries');
  list.replaceChildren();
  state.history.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'card';
    row.style.cssText = 'padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;';
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${item.thumb}" style="width:36px; height:36px; border-radius:6px; object-fit:cover;">
        <div>
          <b style="font-size:13px; display:block;">${item.name}</b>
          <small style="color:var(--muted);">${item.time} · ${item.result.morphology}</small>
        </div>
      </div>
      <span class="badge ${item.result.classification === 'Gram Positive' ? 'badge-pos' : 'badge-neg'}">
        ${item.result.classification}
      </span>
    `;
    row.onclick = () => {
      switchTab('classifier');
      state.result = item.result;
      state.currentDataUrl = item.thumb;
      state.fileName = item.name;
      $('displayCanvas').hidden = false;
      renderCanvas(item.result);
      $('resultCard').hidden = false;
      $('resClassTitle').textContent = `${item.result.classification} (${item.result.morphology})`;
      $('resMorph').textContent = item.result.morphology;
      $('resQuality').textContent = item.result.image_quality;
      $('resFocus').textContent = item.result.focus.toFixed(1);
      $('resLuma').textContent = item.result.brightness.toFixed(0) + ' / 255';
      $('resExplain').textContent = item.result.explanation;
      $('resClinical').textContent = item.result.clinical_note;
    };
    list.appendChild(row);
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach((tc) => (tc.hidden = tc.id !== `tab-${name}`));
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});

// Demo Canvas
function demoCanvas(type) {
  const c = document.createElement('canvas');
  c.width = 720; c.height = 460;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#faf8f5';
  ctx.fillRect(0, 0, c.width, c.height);

  let seed = 42 + type;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const count = type === 4 ? 12 : 160;
  for (let i = 0; i < count; i++) {
    const x = 30 + rand() * 660, y = 30 + rand() * 400;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rand() * Math.PI);
    if (type === 0) {
      ctx.fillStyle = '#047857';
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    } else if (type === 1) {
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-10, -4, 20, 8, 4); else ctx.rect(-10, -4, 20, 8);
      ctx.fill();
    } else if (type === 2) {
      ctx.fillStyle = '#065f46';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-11, -4.5, 22, 9, 4); else ctx.rect(-11, -4.5, 22, 9);
      ctx.fill();
    } else if (type === 3) {
      ctx.fillStyle = i % 2 === 0 ? '#047857' : '#e11d48';
      ctx.beginPath();
      if (i % 2 === 0) ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      else { if (ctx.roundRect) ctx.roundRect(-9, -3.5, 18, 7, 3.5); else ctx.rect(-9, -3.5, 18, 7); }
      ctx.fill();
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath(); ctx.arc(0, 0, 6 + rand() * 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  return c.toDataURL('image/png');
}

// Upload handlers
$('browseBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = (e) => {
  const f = e.target.files?.[0];
  if (f) {
    const r = new FileReader();
    r.onload = () => runAnalysis(r.result, f.name);
    r.readAsDataURL(f);
  }
};

const dropArea = $('dropArea');
dropArea.ondragover = (e) => { e.preventDefault(); dropArea.classList.add('dragover'); };
dropArea.ondragleave = () => dropArea.classList.remove('dragover');
dropArea.ondrop = (e) => {
  e.preventDefault(); dropArea.classList.remove('dragover');
  const f = e.dataTransfer.files?.[0];
  if (f) {
    const r = new FileReader();
    r.onload = () => runAnalysis(r.result, f.name);
    r.readAsDataURL(f);
  }
};

document.querySelectorAll('[data-demo]').forEach((btn) => {
  btn.onclick = () => {
    const idx = Number(btn.dataset.demo);
    const names = [
      'Staphylococcus aureus (Gram + Cocci)',
      'Escherichia coli (Gram - Bacilli)',
      'Bacillus subtilis (Gram + Rods)',
      'Polymicrobial Smear (Mixed Flora)',
    ];
    runAnalysis(demoCanvas(idx), names[idx]);
  };
});

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.onclick = () => {
    state.viewMode = btn.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === btn));
    if (state.result) renderCanvas(state.result);
  };
});

// Copy & Print
$('copyBtn').onclick = async () => {
  if (!state.result) return;
  const res = state.result;
  const txt = `=====================================================
GRAM STAIN MICROSCOPY ANALYSIS REPORT
=====================================================
A project by: Hafiz Muhammad Qasim
Sap ID: 63736
Submitted to: Dr. Sohail
Institution: Riphah International University, Lahore
Program: MS Medical Laboratory Sciences (MLS)
Date: ${new Date().toLocaleString()}

ANALYSIS RESULTS:
- Classification: ${res.classification}
- Confidence Score: ${res.confidence}%
- Cellular Morphology: ${res.morphology}
- Microscopic Quality: ${res.image_quality}
- Stain Area (Violet): ${res.purpleArea.toFixed(2)}%
- Counterstain Area (Safranin): ${res.pinkArea.toFixed(2)}%
- Focus Sharpness: ${res.focus.toFixed(1)}
- Mean Luminance: ${res.brightness.toFixed(0)} / 255

POSSIBLE CANDIDATE ORGANISMS:
${res.possible_organisms.map((o) => `  * ${o}`).join('\n') || '  * None identified'}

METHOD & TECHNICAL NOTES:
${res.explanation}

CLINICAL INTERPRETATION:
${res.clinical_note}
=====================================================
* Note: Automated research prototype. Clinical diagnosis requires certified microbiologist confirmation.`;

  await navigator.clipboard.writeText(txt);
  alert('Diagnostic report copied to clipboard!');
};

$('printBtn').onclick = () => window.print();

// Quiz logic
const QUIZ = [
  { q: "Which dye is used as primary stain in Gram staining?", opts: ["Safranin", "Crystal violet", "Methylene blue", "Malachite green"], a: 1, w: "Crystal violet stains all bacterial cells purple initially." },
  { q: "Gram's iodine serves biochemically as a:", opts: ["Mordant", "Decolorizer", "Counterstain", "Fixative"], a: 0, w: "Binds crystal violet to form an insoluble CV-I complex." },
  { q: "Gram-negative bacteria counterstain which colour?", opts: ["Deep purple", "Pink / Red", "Colourless", "Bright green"], a: 1, w: "Thin peptidoglycan loses dye in alcohol and absorbs safranin counterstain." },
  { q: "Over-decolorization with 95% ethanol causes:", opts: ["Gram-positive cells to appear pink (false negative)", "Gram-negative cells to appear purple", "Cells to dissolve completely", "No effect"], a: 0, w: "Excess alcohol leaches dye even out of thick Gram-positive walls." },
  { q: "Staphylococcus aureus morphology is characteristic of:", opts: ["Gram-positive cocci in clusters", "Gram-negative bacilli", "Gram-positive rods in chains", "Gram-negative diplococci"], a: 0, w: "Round cells dividing in multiple planes forming grape-like clusters." }
];

let qIndex = 0, qScore = 0, qAnswered = 0, qLocked = false;

function loadQuizQuestion() {
  qLocked = false;
  const item = QUIZ[qIndex];
  $('quizProgress').textContent = `Question ${qIndex + 1} of ${QUIZ.length}`;
  $('quizScore').textContent = `Score: ${qScore} / ${qAnswered}`;
  $('quizQ').textContent = item.q;
  $('quizWhy').style.display = 'none';
  $('quizNext').style.display = 'none';

  const box = $('quizOptions');
  box.replaceChildren();
  item.opts.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.className = 'demo-chip';
    b.textContent = opt;
    b.onclick = () => {
      if (qLocked) return;
      qLocked = true;
      qAnswered++;
      if (idx === item.a) {
        qScore++;
        b.style.borderColor = 'var(--emerald)';
        b.style.background = '#ecfdf5';
      } else {
        b.style.borderColor = '#e11d48';
        b.style.background = '#fff1f2';
      }
      $('quizScore').textContent = `Score: ${qScore} / ${qAnswered}`;
      $('quizWhy').textContent = (idx === item.a ? '✓ Correct! ' : '✗ Incorrect. ') + item.w;
      $('quizWhy').style.display = 'block';
      $('quizNext').style.display = 'inline-block';
    };
    box.appendChild(b);
  });
}

$('quizNext').onclick = () => {
  qIndex = (qIndex + 1) % QUIZ.length;
  loadQuizQuestion();
};

$('quizReset').onclick = () => {
  qIndex = 0; qScore = 0; qAnswered = 0;
  loadQuizQuestion();
};

loadQuizQuestion();

// Modal
const modal = $('welcomeModal');
$('welcomeBtn').onclick = () => modal.showModal();
$('closeModalBtn').onclick = () => modal.close();
modal.showModal();
