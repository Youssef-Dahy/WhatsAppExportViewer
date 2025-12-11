// Elements
const fileInput = document.getElementById("fileInput");
const chatEl = document.getElementById("chat");
const placeholder = document.getElementById("placeholder");
const errorEl = document.getElementById("error");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const downloadJsonBtn = document.getElementById("downloadJson");
const toggleLangBtn = document.getElementById("toggleLang");

// Lightbox elements
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxPrev = document.getElementById("lightboxPrev");
const lightboxNext = document.getElementById("lightboxNext");
const lightboxCounter = document.getElementById("lightboxCounter");
const lightboxInfo = document.getElementById("lightboxInfo");

let messages = []; // parsed messages
let mediaMap = {}; // filename -> blobURL
let currentLang = "ar"; // Current language
let currentImages = []; // جميع الصور في المحادثة للـ Lightbox
let currentIndex = 0; // الفهرس الحالي للـ Lightbox

// Common WhatsApp export line regexes (multiple locales)
const lineRegexList = [
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(.*?):\s*(.*)$/,
  /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(.*?):\s*(.*)$/,
  /^(\d{4}-\d{1,2}-\d{1,2}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(.*?):\s*(.*)$/,
  /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]\s*(.*?)\s*:\s*(.*)$/,
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(.*?)\s*[:‏]\s*(.*)$/,
  /^(\d{4}-\d{1,2}-\d{1,2}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*\+?\d*\s*(.*?)\s*[:‏]\s*(.*)$/,
];

// Translations
const translations = {
  ar: {
    title: "عرض محادثة واتساب من ملف التصدير",
    subtitle: "ارفع ملف .txt أو ملف مضغوط ZIP (يحتوي على txt و/أو مجلد Media)",
    searchPlaceholder: "اكتب كلمة للبحث",
    clearSearch: "مسح",
    exportJson: "تصدير JSON",
    toggleLang: "English",
    noMessages: "لا توجد رسائل — ارفع ملف التصدير لعرض المحادثة.",
    note: "ملاحظة: هذا عرض تجريبي. إذا لم تتعرف الصيغة على ملفك، انسخ أول 10 أسطر من ملف .txt هنا وسأعدّل المحلل ليتعامل معه.",
    you: "أنت",
    today: "اليوم",
    yesterday: "أمس",
    errorNoTxt:
      "لم أجد ملف .txt داخل الأرشيف. تأكد أنك صدّرت المحادثة بشكل صحيح.",
    errorFileType: "امتداد غير مدعوم. ارفع ZIP أو TXT.",
    errorReadTxt: "فشل قراءة ملف .txt",
  },
  en: {
    title: "WhatsApp Export Viewer",
    subtitle:
      "Upload a .txt file or ZIP file (containing txt and/or Media folder)",
    searchPlaceholder: "Type a word to search",
    clearSearch: "Clear",
    exportJson: "Export JSON",
    toggleLang: "العربية",
    noMessages: "No messages — upload an export file to view the conversation.",
    note: "Note: This is a demo viewer. If the format doesn't recognize your file, copy the first 10 lines of your .txt file here and I'll adjust the parser.",
    you: "You",
    today: "Today",
    yesterday: "Yesterday",
    errorNoTxt:
      "No .txt file found in the archive. Make sure you exported correctly.",
    errorFileType: "Unsupported extension. Upload ZIP or TXT.",
    errorReadTxt: "Failed to read .txt file",
  },
};

// ========== PARSING FUNCTIONS ==========
function tryParseLine(line) {
  for (const r of lineRegexList) {
    const m = r.exec(line);
    if (m) {
      const datePart = m[1];
      const timePart = m[2];
      const sender = m[3];
      const text = m[4];
      let iso = null;

      if (/^\d{4}-/.test(datePart)) {
        iso = dayjs(datePart + " " + timePart).toISOString();
      } else {
        const parts = datePart.split("/");
        let dd = parts[0],
          mm = parts[1],
          yyyy = parts[2];
        if (yyyy.length === 2) yyyy = "20" + yyyy;
        try {
          iso = dayjs(`${yyyy}-${mm}-${dd} ${timePart}`).toISOString();
        } catch (e) {
          try {
            iso = dayjs(`${yyyy}-${dd}-${mm} ${timePart}`).toISOString();
          } catch (e2) {
            iso = new Date().toISOString();
          }
        }
      }

      return { time: iso, sender, text };
    }
  }
  return null;
}

function parseRaw(raw) {
  const lines = raw.split(/\r?\n/);
  const msgs = [];
  let current = null;

  for (const line of lines) {
    if (line.trim() === "") continue;
    const parsed = tryParseLine(line);
    if (parsed) {
      if (current) msgs.push(current);
      current = Object.assign({ id: msgs.length }, parsed);
    } else {
      if (current) {
        current.text += "\n" + line;
      } else {
        msgs.push({
          id: msgs.length,
          time: new Date().toISOString(),
          sender: "System",
          text: line,
        });
      }
    }
  }
  if (current) msgs.push(current);
  return msgs;
}

// ========== MEDIA FUNCTIONS ==========
function extractMediaFromMessage(text) {
  const mediaPatterns = [
    /<مرفق:\s*([^>]+\.(jpg|jpeg|png|gif|mp4|mov|3gp|avi|m4v|webm|opus|m4a|mp3|ogg))>/i,
    /\(مرفق:\s*([^)]+\.(jpg|jpeg|png|gif|mp4|mov|3gp|avi|m4v|webm|opus|m4a|mp3|ogg))\)/i,
    /(IMG-\d{8}-WA\d{4}\.(jpg|jpeg|png))|(VID-\d{8}-WA\d{4}\.(mp4|mov|3gp))|(AUD-\d{8}-WA\d{4}\.(opus|m4a))|(PTT-\d{8}-WA\d{4}\.(opus))/i,
    /(\b(image|video|audio)-\d+-\d+-\d+\.(jpg|mp4|opus))\b/i,
    /(Media\/[^)\s]+\.(jpg|jpeg|png|gif|mp4|mov|3gp|avi|opus|m4a|mp3))/i,
    /((IMG|VID|AUD|PTT)_[^.]+\.(jpg|png|mp4|opus|m4a))/i,
  ];

  for (const pattern of mediaPatterns) {
    const match = pattern.exec(text);
    if (match) {
      for (let i = 1; i < match.length; i++) {
        if (match[i] && match[i].includes(".")) {
          return match[i];
        }
      }
      return match[0];
    }
  }
  return null;
}

function findMediaUrl(filename) {
  const possiblePaths = [
    filename,
    "Media/" + filename,
    "WhatsApp/Media/" + filename,
    filename.split("/").pop(),
    decodeURIComponent(filename),
    filename.replace(/^.*[\\\/]/, ""),
  ];

  for (const path of possiblePaths) {
    if (mediaMap[path]) {
      return mediaMap[path];
    }
  }

  const cleanFilename = filename.split("/").pop();
  for (const key in mediaMap) {
    if (
      key.includes(cleanFilename) ||
      cleanFilename.includes(key.split("/").pop())
    ) {
      return mediaMap[key];
    }
  }

  return null;
}

function addMediaToMessage(container, filename, url) {
  const ext = filename.split(".").pop().toLowerCase();
  const mediaContainer = document.createElement("div");
  mediaContainer.className = "media-container";

  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) {
    const img = document.createElement("img");
    img.src = url;
    img.className = "media";
    img.alt = filename;
    img.onload = () => {
      const maxWidth = 300;
      const maxHeight = 300;
      let width = img.naturalWidth;
      let height = img.naturalHeight;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      img.style.width = width + "px";
      img.style.height = height + "px";
    };

    // إضافة حدث النقر لتكبير الصورة
    img.addEventListener("click", function (e) {
      e.stopPropagation();
      collectAllImages();

      const allImages = document.querySelectorAll(".media-container img.media");
      let imgIndex = -1;
      allImages.forEach((imgEl, index) => {
        if (imgEl.src === this.src) {
          imgIndex = index;
        }
      });

      if (imgIndex !== -1) {
        openLightbox(imgIndex);
      }
    });

    mediaContainer.appendChild(img);
  } else if (["mp4", "mov", "3gp", "avi", "mkv", "webm", "m4v"].includes(ext)) {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.className = "media";
    video.style.maxWidth = "300px";
    video.style.maxHeight = "300px";

    const source = document.createElement("source");
    source.src = url;
    source.type = `video/${ext === "mov" ? "mp4" : ext}`;
    video.appendChild(source);
    mediaContainer.appendChild(video);

    // تكبير الفيديو بكامل الشاشة عند النقر
    video.addEventListener("click", function (e) {
      e.stopPropagation();
      if (this.requestFullscreen) {
        this.requestFullscreen();
      } else if (this.webkitRequestFullscreen) {
        this.webkitRequestFullscreen();
      } else if (this.mozRequestFullScreen) {
        this.mozRequestFullScreen();
      } else if (this.msRequestFullscreen) {
        this.msRequestFullscreen();
      }
    });
  } else if (["mp3", "opus", "m4a", "aac", "wav", "ogg", "wma"].includes(ext)) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.className = "media";
    audio.style.width = "250px";

    const source = document.createElement("source");
    source.src = url;
    source.type = `audio/${ext === "opus" ? "ogg" : ext}`;
    audio.appendChild(source);
    mediaContainer.appendChild(audio);
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.className = "media-file";
    link.textContent = `📎 ${filename}`;
    mediaContainer.appendChild(link);
  }

  container.appendChild(mediaContainer);
}

// ========== LIGHTBOX FUNCTIONS ==========
function collectAllImages() {
  currentImages = [];
  const allMediaContainers = document.querySelectorAll(
    ".media-container img.media"
  );
  allMediaContainers.forEach((img, index) => {
    const bubble = img.closest(".msg");
    let sender = "";
    let time = "";

    if (bubble) {
      const metaSender = bubble.querySelector(".meta .sender-name");
      const metaTime = bubble.querySelector(".meta .timestamp");
      sender = metaSender ? metaSender.textContent : "";
      time = metaTime ? metaTime.textContent : "";
    }

    currentImages.push({
      src: img.src,
      alt: img.alt || `${translations[currentLang].you} - ${index + 1}`,
      sender: sender,
      time: time,
    });
  });
}

function openLightbox(index) {
  if (currentImages.length === 0) return;

  currentIndex = index;
  const currentImage = currentImages[currentIndex];

  lightboxImg.src = currentImage.src;
  lightboxImg.alt = currentImage.alt;

  lightboxCounter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
  lightboxInfo.textContent = `${currentImage.sender} • ${currentImage.time}`;

  lightboxPrev.disabled = currentIndex === 0;
  lightboxNext.disabled = currentIndex === currentImages.length - 1;

  lightbox.classList.add("active");
  document.body.style.overflow = "hidden";

  document.addEventListener("keydown", handleLightboxKeydown);
}

function closeLightbox() {
  lightbox.classList.remove("active");
  document.body.style.overflow = "";
  document.removeEventListener("keydown", handleLightboxKeydown);
}

function handleLightboxKeydown(e) {
  switch (e.key) {
    case "Escape":
      closeLightbox();
      break;
    case "ArrowLeft":
      if (currentIndex > 0) {
        openLightbox(currentIndex - 1);
      }
      break;
    case "ArrowRight":
      if (currentIndex < currentImages.length - 1) {
        openLightbox(currentIndex + 1);
      }
      break;
  }
}

function nextImage() {
  if (currentIndex < currentImages.length - 1) {
    openLightbox(currentIndex + 1);
  }
}

function prevImage() {
  if (currentIndex > 0) {
    openLightbox(currentIndex - 1);
  }
}

// ========== RENDERING FUNCTIONS ==========
function clearUI() {
  chatEl.innerHTML = "";
  placeholder.style.display = "block";
  errorEl.style.display = "none";
  currentImages = [];
}

function renderMessages(filterText = "") {
  chatEl.innerHTML = "";
  if (messages.length === 0) {
    placeholder.style.display = "block";
    placeholder.textContent = translations[currentLang].noMessages;
    return;
  }
  placeholder.style.display = "none";

  const query = filterText.trim().toLowerCase();
  const filtered = query
    ? messages.filter(
        (m) =>
          (m.text || "").toLowerCase().includes(query) ||
          (m.sender || "").toLowerCase().includes(query)
      )
    : messages;

  for (const m of filtered) {
    const row = document.createElement("div");
    const isYou = /^(You|انا|أنا|Me|أنت|you)$/i.test(m.sender);
    row.className = "row " + (isYou ? "you" : "other");

    const bubble = document.createElement("div");
    bubble.className = "msg " + (isYou ? "you" : "other");

    const meta = document.createElement("div");
    meta.className = "meta";

    let timeText = m.time ? dayjs(m.time).format("YYYY-MM-DD HH:mm") : "";
    const now = dayjs();
    const msgTime = dayjs(m.time);

    if (msgTime.isValid()) {
      if (msgTime.isSame(now, "day")) {
        timeText =
          translations[currentLang].today + " " + msgTime.format("HH:mm");
      } else if (msgTime.isSame(now.subtract(1, "day"), "day")) {
        timeText =
          translations[currentLang].yesterday + " " + msgTime.format("HH:mm");
      }
    }

    let displaySender = m.sender || "Unknown";
    if (isYou) {
      displaySender = translations[currentLang].you;
    }

    meta.innerHTML = `<span class="sender-name">${displaySender}</span>
                            <span class="timestamp">${timeText}</span>`;

    const mediaKey = extractMediaFromMessage(m.text);
    let displayText = m.text || "";

    if (mediaKey) {
      displayText = displayText
        .replace(/<مرفق:[^>]+>/g, "")
        .replace(/\(مرفق:[^)]+\)/g, "")
        .trim();
    }

    const textNode = document.createElement("div");
    textNode.innerHTML = linkify(escapeHtml(displayText));

    if (mediaKey) {
      const mediaUrl = findMediaUrl(mediaKey);
      if (mediaUrl) {
        addMediaToMessage(bubble, mediaKey, mediaUrl);
      }
    }

    bubble.appendChild(meta);
    bubble.appendChild(textNode);
    row.appendChild(bubble);
    chatEl.appendChild(row);
  }

  chatEl.scrollTop = chatEl.scrollHeight;

  setTimeout(() => {
    collectAllImages();
  }, 100);
}

// ========== HELPER FUNCTIONS ==========
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, function (url) {
    return (
      '<a href="' +
      url +
      '" target="_blank" style="color: #007bff; text-decoration: none;">' +
      url +
      "</a>"
    );
  });
}

function changeLanguage(lang) {
  currentLang = lang;

  document.querySelector("h1").textContent = translations[lang].title;
  document.querySelector(".small").textContent = translations[lang].subtitle;
  document.getElementById("searchInput").placeholder =
    translations[lang].searchPlaceholder;
  document.getElementById("clearSearch").textContent =
    translations[lang].clearSearch;
  document.getElementById("downloadJson").textContent =
    translations[lang].exportJson;
  document.getElementById("toggleLang").textContent =
    translations[lang].toggleLang;
  document.querySelector(".footer").textContent = translations[lang].note;
  document.getElementById("placeholder").textContent =
    translations[lang].noMessages;

  document.body.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;

  localStorage.setItem("whatsapp-viewer-lang", lang);

  renderMessages(searchInput.value);
}

// ========== FILE HANDLING ==========
async function handleZipFile(file) {
  errorEl.style.display = "none";
  mediaMap = {};
  messages = [];

  try {
    const z = new JSZip();
    const content = await z.loadAsync(file);

    const txtEntries = Object.keys(content.files).filter(
      (k) => /\.txt$/i.test(k) && !content.files[k].dir
    );

    if (txtEntries.length === 0) {
      throw new Error(translations[currentLang].errorNoTxt);
    }

    const txt = await content.files[txtEntries[0]].async("string");
    messages = parseRaw(txt);

    const mediaPromises = [];

    Object.keys(content.files).forEach((filename) => {
      const fileObj = content.files[filename];
      if (!fileObj.dir && !/\.txt$/i.test(filename)) {
        mediaPromises.push(
          fileObj.async("blob").then((blob) => {
            const cleanName = filename.split("/").pop();
            const url = URL.createObjectURL(blob);

            mediaMap[filename] = url;
            mediaMap[cleanName] = url;
            mediaMap[decodeURIComponent(filename)] = url;
            mediaMap[decodeURIComponent(cleanName)] = url;

            if (filename.includes("Media/") || filename.includes("WhatsApp/")) {
              const relativePath =
                filename.split("Media/").pop() ||
                filename.split("WhatsApp/").pop();
              if (relativePath) {
                mediaMap[relativePath] = url;
                mediaMap["Media/" + relativePath] = url;
              }
            }
          })
        );
      }
    });

    await Promise.all(mediaPromises);
    console.log(`Loaded ${Object.keys(mediaMap).length} media files`);
    renderMessages(searchInput.value);
  } catch (err) {
    errorEl.style.display = "block";
    errorEl.textContent = "Error: " + (err.message || String(err));
    console.error(err);
    clearUI();
  }
}

async function handleTxtFile(file) {
  try {
    const txt = await file.text();
    messages = parseRaw(txt);
    mediaMap = {};
    renderMessages();
  } catch (err) {
    errorEl.style.display = "block";
    errorEl.textContent = translations[currentLang].errorReadTxt;
    clearUI();
  }
}

// ========== EVENT LISTENERS ==========
fileInput.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (/\.zip$/i.test(f.name)) {
    handleZipFile(f);
  } else if (/\.txt$/i.test(f.name)) {
    handleTxtFile(f);
  } else {
    errorEl.style.display = "block";
    errorEl.textContent = translations[currentLang].errorFileType;
  }
});

searchInput.addEventListener("input", () => renderMessages(searchInput.value));

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  renderMessages();
});

toggleLangBtn.addEventListener("click", () => {
  const newLang = currentLang === "ar" ? "en" : "ar";
  changeLanguage(newLang);
});

downloadJsonBtn.addEventListener("click", () => {
  if (messages.length === 0) return alert(translations[currentLang].noMessages);
  const blob = new Blob([JSON.stringify({ messages: messages }, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "whatsapp_export.json";
  a.click();
});

// Lightbox events
lightboxClose.addEventListener("click", closeLightbox);
lightboxPrev.addEventListener("click", prevImage);
lightboxNext.addEventListener("click", nextImage);

lightbox.addEventListener("click", function (e) {
  if (e.target === lightbox) {
    closeLightbox();
  }
});

// ========== INITIALIZATION ==========
document.addEventListener("DOMContentLoaded", function () {
  const savedLang = localStorage.getItem("whatsapp-viewer-lang");
  const browserLang = navigator.language.startsWith("ar") ? "ar" : "en";
  const initialLang = savedLang || browserLang || "ar";

  changeLanguage(initialLang);

  window.addEventListener("beforeunload", () => {
    Object.values(mediaMap).forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    });
  });
});
