import { keys, shoot, speedKey, shieldKey, ultKey } from "./keyboard.js";
import { keys2, shoot2 } from "./keyboard2.js";
import { touchVector, touchShoot, touchSpeed, touchShield, touchUlt } from "./touchpad.js";

export function getPlayer1Input() {
    let x = 0;
    let y = 0;
    
    // Gunakan paduan sentuhan dan fallback keyboard
    if (Math.abs(touchVector.x) > 0.05 || Math.abs(touchVector.y) > 0.05) {
        x = touchVector.x;
        y = touchVector.y;
    } else {
        x = (keys["d"] ? 1 : 0) - (keys["a"] ? 1 : 0);
        y = (keys["s"] ? 1 : 0) - (keys["w"] ? 1 : 0);
    }
    
    return {
        x: x,
        y: y,
        shoot: shoot || touchShoot,
        speed: speedKey || touchSpeed,
        shield: shieldKey || touchShield,
        ult: ultKey || touchUlt
    };
}

export function getPlayer2Input() {
    return {
        x: (keys2["ArrowRight"] ? 1 : 0) - (keys2["ArrowLeft"] ? 1 : 0),
        y: (keys2["ArrowDown"] ? 1 : 0) - (keys2["ArrowUp"] ? 1 : 0),
        shoot: shoot2
    };
}