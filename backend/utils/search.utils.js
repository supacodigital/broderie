/* Helpers de recherche produit — partagés entre la boutique (FULLTEXT) et
   l'administration (LIKE). Les deux moteurs diffèrent, mais doivent traiter la
   saisie de la même façon : sans quoi une recherche qui aboutit côté boutique
   échoue côté admin, et la cliente ne comprend pas pourquoi. */

/* Retire la marque du pluriel français (« cotons » → « coton »).
   Sans cela « cotons » ne retrouve pas « coton » : ni le joker « * » du FULLTEXT ni
   un LIKE « %cotons% » ne raccourcissent le terme saisi. C'est le cas concret
   signalé par la cliente — « cotons moulinés » ne remontait rien alors que les
   fiches disent « échevette de coton mouliné » au singulier.
   Les mots de 3 lettres ou moins sont laissés intacts (« bas », « lps »…). */
const singularize = (token) => (token.length > 3 ? token.replace(/[sx]$/i, '') : token);

/* Apostrophes, droite et typographiques : le clavier de l'iPhone saisit « ’ » et
   non « ' ». Elles séparent les mots, comme dans l'index FULLTEXT de MySQL qui
   découpe « l'Avent » en « l » + « avent ». Gardées dans le terme, elles rendaient
   toute recherche avec élision infructueuse : « calendrier de l'Avent » ne
   trouvait aucun des 129 calendriers de l'Avent du catalogue. */
const APOSTROPHES = /['’‘ʼ`´]/g;

/* Ponctuation qui sépare les mots sans en faire partie. La recherche FULLTEXT
   l'ignorait déjà, mais la recherche admin (LIKE) exigeait « permin, » avec sa
   virgule. Le point et le trait d'union restent : « 2.5 », « 1006-5860 ». */
const SEPARATORS = /[,;:!?«»“”„]/g;

/* Lettre isolée laissée par une élision (« l », « d », « j »…) : aucun intérêt
   pour la recherche, et elle prenait une des places limitées — « Permin, kit
   calendrier de l'Avent Nain » comptait 7 mots, et « nain » était coupé. Un
   chiffre isolé est gardé : « perlé 5 » en a besoin. */
const isElisionLeftover = (token) => token.length === 1 && !/[0-9]/.test(token);

/* Découpe une saisie en mots bruts : ni limite, ni singulier. Sert aux moteurs
   qui doivent écarter certains mots AVANT la mise au singulier (voir
   product.repository, mots vides du FULLTEXT). */
const splitSearchWords = (input) =>
  String(input ?? '')
    .replace(APOSTROPHES, ' ')
    .replace(SEPARATORS, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !isElisionLeftover(token));

/* Découpe une saisie en mots exploitables, ramenés au singulier.
   `max` borne le nombre de termes : au-delà la requête coûte plus qu'elle ne sert.
   La borne s'applique APRÈS le retrait des restes d'élision. */
const toSearchTerms = (input, max = 6) =>
  splitSearchWords(input)
    .slice(0, max)
    .map(singularize);

module.exports = { singularize, splitSearchWords, toSearchTerms };
