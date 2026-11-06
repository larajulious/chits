import type { MascotVariant } from './mascot-variants';

// One fabric accessory, in the original body's upright coordinates. The broad,
// rounded wrap follows the supplied reference; its hem stays above every eye
// expression (the open eyes reach -103). The yellow tape sits over the cloth.
const cloth = 'M-400 -143 L-397 -282 Q-396 -351 -340 -374 Q-210 -410 8 -404 Q227 -407 339 -371 Q392 -352 397 -285 L403 -145 Q220 -195 7 -191 Q-212 -189 -400 -143 Z';
const paisley = `<path d="M-2 31 C-11 15 -31 7 -27 -13 C-23 -34 3 -39 19 -23 C35 -6 20 13 -2 31 Z"/><path d="M-7 16 C-9 6 14 4 12 -10 C11 -22 -6 -24 -10 -14 C-15 -4 -1 2 3 -6"/><circle cx="-5" cy="-13" r="3" fill="#FFF5DF" stroke="none"/>`;
const flower = `<path d="M0 -21 C8 -24 12 -14 10 -9 C26 -15 29 1 16 6 C24 17 10 26 3 15 C-1 31 -17 24 -13 12 C-29 13 -28 -3 -15 -5 C-24 -16 -10 -25 -5 -14 C-5 -19 -3 -21 0 -21 Z"/><circle r="4"/>`;
const motifs = [
  [-332, -287, -34, 0.9], [-229, -342, 66, 0.78], [-125, -264, 145, 0.83],
  [30, -338, -28, 0.9], [162, -276, 152, 0.92], [277, -330, 44, 0.86],
  [345, -229, -12, 0.75], [-284, -205, 135, 0.75], [20, -207, 24, 0.7],
];
const flowers = [[-235, -263, 15], [-64, -343, -18], [83, -273, 20], [259, -228, -12], [-365, -193, 18]];

export const BANDANA_MARKUP = `<g id="chits-bandana">
  <defs><clipPath id="chits-bandana-cloth"><path d="${cloth}"/></clipPath></defs>
  <!-- Short, soft folds tucked into the side, rather than a projecting bow. -->
  <path d="M373 -247 Q420 -269 444 -244 Q429 -226 420 -211 Q449 -205 453 -182 Q419 -176 386 -203 Z" fill="#A92F38" stroke="#F9EBD2" stroke-width="7" stroke-linejoin="round"/>
  <path d="M387 -218 Q414 -203 421 -173 L401 -181 L390 -160 Q373 -182 373 -205 Z" fill="#BC3C43" stroke="#F9EBD2" stroke-width="6" stroke-linejoin="round"/>
  <path d="${cloth}" fill="#BC3C43" stroke="#F9EBD2" stroke-width="10" stroke-linejoin="round"/>
  <g clip-path="url(#chits-bandana-cloth)">
    <path d="M-400 -143 Q-212 -189 7 -191 Q220 -195 403 -145 L403 -162 Q215 -212 7 -207 Q-215 -205 -400 -160 Z" fill="#982E38"/>
    <path d="M-391 -161 Q-211 -205 7 -207 Q220 -211 394 -163" fill="none" stroke="#FFF5DF" stroke-width="5" stroke-linecap="round"/>
    <path d="M-382 -275 Q-379 -335 -329 -354 Q-187 -391 8 -386 Q221 -390 328 -353 Q374 -337 379 -279" fill="none" stroke="#E9A398" stroke-width="4" stroke-linecap="round"/>
    <g fill="none" stroke="#FFF5DF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      ${motifs.map(([x, y, angle, scale]) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">${paisley}</g>`).join('')}
      ${flowers.map(([x, y, angle]) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(.65)">${flower}</g>`).join('')}
      <path d="M-306 -346 l5 -5 5 5 -5 5 Z M-178 -228 l5 -5 5 5 -5 5 Z M-52 -245 l5 -5 5 5 -5 5 Z M205 -348 l5 -5 5 5 -5 5 Z M307 -280 l5 -5 5 5 -5 5 Z"/>
      <circle cx="-181" cy="-303" r="3" fill="#FFF5DF" stroke="none"/><circle cx="119" cy="-345" r="3" fill="#FFF5DF" stroke="none"/><circle cx="221" cy="-294" r="3" fill="#FFF5DF" stroke="none"/>
    </g>
    <path d="M-389 -214 Q-361 -225 -342 -249 M389 -211 Q363 -221 350 -243" fill="none" stroke="#A22E38" stroke-width="7" stroke-linecap="round"/>
  </g>
  <path d="M384 -225 Q398 -232 406 -214 L404 -195 Q391 -187 382 -201 Z" fill="#AB323C" stroke="#F9EBD2" stroke-width="5"/>
</g>`;

export function mascotSvg(svg: string, variant: MascotVariant, still = false) {
  // The original tape, face and cloth inherit the same tilted body transforms.
  const dressed = variant === 'chits-ong' ? svg.replace('<!-- Tape -->', `${BANDANA_MARKUP}\n<!-- Tape -->`) : svg;
  return still ? dressed.replace(/<style>[\s\S]*?<\/style>/, '') : dressed;
}
