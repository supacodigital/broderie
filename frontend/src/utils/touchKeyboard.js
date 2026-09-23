/* Ouvre le clavier tactile PENDANT le tap de la cliente (CLI-01).

   Sur iPhone, Safari n'ouvre le clavier que si le curseur est posé dans un champ
   au cours même du geste (le gestionnaire du tap). Le tiroir de recherche mobile
   n'existe pas encore à cet instant : il apparaît au rendu suivant, et son champ
   reçoit le curseur quelques dizaines de millisecondes plus tard — trop tard pour
   iOS. Résultat : le tiroir s'ouvrait sans clavier, le champ paraissait mort
   (« depuis un natel le champ de recherche est inopérant »).

   Parade : un champ invisible reçoit le curseur tout de suite, ce qui ouvre le
   clavier ; le vrai champ le récupère dès qu'il est affiché (iOS autorise ce
   transfert une fois le clavier ouvert). Le champ relais disparaît ensuite. */

// Délai au-delà duquel le champ relais est retiré, que le relais ait eu lieu ou non
const PROXY_LIFETIME_MS = 1500;

export function openKeyboardDuringTap() {
  if (typeof document === 'undefined') return;

  const proxy = document.createElement('input');
  proxy.type = 'text';
  proxy.tabIndex = -1;
  proxy.setAttribute('aria-hidden', 'true');
  proxy.setAttribute('data-keyboard-proxy', '');
  /* 16 px : en dessous, Safari zoome sur le champ qui reçoit le curseur.
     Hors du flux et transparent : invisible, et impossible à toucher. */
  proxy.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;' +
    'font-size:16px;border:0;padding:0;pointer-events:none;';

  document.body.appendChild(proxy);
  proxy.focus({ preventScroll: true });

  setTimeout(() => proxy.remove(), PROXY_LIFETIME_MS);
}
