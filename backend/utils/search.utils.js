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

/* Découpe une saisie en mots exploitables, ramenés au singulier.
   `max` borne le nombre de termes : au-delà la requête coûte plus qu'elle ne sert. */
const toSearchTerms = (input, max = 6) =>
  String(input ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map(singularize);

module.exports = { singularize, toSearchTerms };
