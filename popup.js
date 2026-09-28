const wordsBox = document.getElementById("words");
const status = document.getElementById("status");

function getWords() {
  return [...new Set(
    wordsBox.value
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean)
  )];
}

async function send(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");

  return chrome.tabs.sendMessage(tab.id, {
    action,
    words: action === "highlight" ? getWords() : []
  });
}

document.getElementById("highlight").addEventListener("click", async () => {
  const words = getWords();

  if (!words.length) {
    status.textContent = "Please enter at least one word or phrase.";
    return;
  }

  try {
    const result = await send("highlight");
    status.textContent = `Highlighted ${result.count} match(es).`;
  } catch (e) {
    status.textContent = "This page cannot be modified.";
  }
});

document.getElementById("clear").addEventListener("click", async () => {
  try {
    const result = await send("clear");
    status.textContent = `Cleared ${result.count} highlight(s).`;
  } catch (e) {
    status.textContent = "This page cannot be modified.";
  }
});