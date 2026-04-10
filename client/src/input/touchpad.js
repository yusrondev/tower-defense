export let touchVector = { x: 0, y: 0 };
export let touchShoot = false;
export let touchSpeed = false;
export let touchShield = false;
export let touchUlt = false;

export function initTouchpad() {
  const joystickZone = document.getElementById("joystick-zone");
  const joystickStick = document.getElementById("joystick-stick");
  const shootBtn = document.getElementById("shoot-btn");
  const speedBtn = document.getElementById("speed-btn");
  const shieldBtn = document.getElementById("shield-btn");
  const ultBtn = document.getElementById("ult-btn");

  let activeTouchId = null;
  const maxRadius = 35; // Maximum travel distance for the stick
  
  let centerX = 0;
  let centerY = 0;

  function reflow() {
    const rect = joystickZone.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
  }
  
  window.addEventListener("resize", reflow);
  // Defer the first reflow measurement briefly to let layout settle
  setTimeout(reflow, 100);

  function resetJoystick() {
    activeTouchId = null;
    touchVector.x = 0;
    touchVector.y = 0;
    joystickStick.style.transform = `translate(0px, 0px)`;
  }

  joystickZone.addEventListener("pointerdown", (e) => {
    if (activeTouchId !== null) return;
    activeTouchId = e.pointerId;
    reflow();
    joystickZone.setPointerCapture(e.pointerId);
    handlePointerMove(e);
  });

  function handlePointerMove(e) {
    if (e.pointerId !== activeTouchId) return;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    // Limit stick dragging to our radius zone
    if (distance > maxRadius) {
      dx = (dx / distance) * maxRadius;
      dy = (dy / distance) * maxRadius;
    }

    joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;

    // Convert into a percentage (-1.0 to 1.0 logic) to be used by the player
    touchVector.x = dx / maxRadius;
    touchVector.y = dy / maxRadius;
  }

  joystickZone.addEventListener("pointermove", handlePointerMove);

  joystickZone.addEventListener("pointerup", (e) => {
    if (e.pointerId === activeTouchId) {
      resetJoystick();
    }
  });

  joystickZone.addEventListener("pointercancel", (e) => {
    if (e.pointerId === activeTouchId) {
      resetJoystick();
    }
  });

  // Shoot button listeners
  shootBtn.addEventListener("pointerdown", (e) => {
    shootBtn.setPointerCapture(e.pointerId);
    touchShoot = true;
  });

  shootBtn.addEventListener("pointerup", (e) => {
    touchShoot = false;
  });

  shootBtn.addEventListener("pointercancel", (e) => {
    touchShoot = false;
  });
  
  if (speedBtn) {
      speedBtn.addEventListener("pointerdown", (e) => {
        speedBtn.setPointerCapture(e.pointerId);
        touchSpeed = true;
      });
      speedBtn.addEventListener("pointerup", () => touchSpeed = false);
      speedBtn.addEventListener("pointercancel", () => touchSpeed = false);
  }
  
  if (shieldBtn) {
      shieldBtn.addEventListener("pointerdown", (e) => {
        shieldBtn.setPointerCapture(e.pointerId);
        touchShield = true;
      });
      shieldBtn.addEventListener("pointerup", () => touchShield = false);
      shieldBtn.addEventListener("pointercancel", () => touchShield = false);
  }

  if (ultBtn) {
      ultBtn.addEventListener("pointerdown", (e) => {
        ultBtn.setPointerCapture(e.pointerId);
        touchUlt = true;
      });
      ultBtn.addEventListener("pointerup", () => touchUlt = false);
      ultBtn.addEventListener("pointercancel", () => touchUlt = false);
  }
  
  // Prevent default menu dialog on touch hold
  document.addEventListener("contextmenu", event => event.preventDefault());
}

initTouchpad();
