export const keys2 = {};
export let shoot2 = false;

window.addEventListener("keydown", (e) => {
  keys2[e.key] = true;

  if (e.key === "Enter") {
    shoot2 = true;
  }
});

window.addEventListener("keyup", (e) => {
  keys2[e.key] = false;

  if (e.key === "Enter") {
    shoot2 = false;
  }
});