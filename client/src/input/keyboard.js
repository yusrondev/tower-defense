export const keys = {};
export let shoot = false;
export let speedKey = false;
export let shieldKey = false;
export let ultKey = false;

window.addEventListener("keydown", (e) => {
  keys[e.key] = true;

  if (e.key === " ") shoot = true;
  if (e.key === "Shift") speedKey = true;
  if (e.key === "e" || e.key === "E") shieldKey = true;
  if (e.key === "r" || e.key === "R") ultKey = true;
});

window.addEventListener("keyup", (e) => {
  keys[e.key] = false;

  if (e.key === " ") shoot = false;
  if (e.key === "Shift") speedKey = false;
  if (e.key === "e" || e.key === "E") shieldKey = false;
  if (e.key === "r" || e.key === "R") ultKey = false;
});