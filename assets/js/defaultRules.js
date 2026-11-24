// Diccionario base de reglas de clasificación en español, precargado en toda base de
// datos nueva para que comercios habituales no entren todos como "sin clasificar".
// Prioridad alta (500+) para que cualquier regla que el usuario cree a mano (o
// "recuerde" desde Mis Gastos, que usa prioridad 100) se evalúe antes y pueda anular
// estas reglas de fábrica sin tener que desactivarlas.
'use strict';

const DefaultRules = (() => {
  // [patrón, pilar, etiquetas[], prioridad (opcional, 500 por defecto)]
  const DEFINITIONS = [
    // Supermercados -> Supervivencia
    ['MERCADONA', 'supervivencia', []],
    ['HIPERDINO', 'supervivencia', []],
    ['LIDL', 'supervivencia', []],
    ['CARREFOUR', 'supervivencia', []],
    ['DIA ', 'supervivencia', []],
    ['ALCAMPO', 'supervivencia', []],
    ['EROSKI', 'supervivencia', []],
    ['CONSUM', 'supervivencia', []],
    ['ALDI', 'supervivencia', []],

    // Suscripciones digitales -> Ocio y Vicio
    ['NETFLIX', 'ocio', ['#suscripcion']],
    ['HBOMAX', 'ocio', ['#suscripcion']],
    ['HBO MAX', 'ocio', ['#suscripcion']],
    ['GOOGLE ONE', 'ocio', ['#suscripcion']],
    ['SPOTIFY', 'ocio', ['#suscripcion']],
    ['DISNEY', 'ocio', ['#suscripcion']],
    ['PRIME VIDEO', 'ocio', ['#suscripcion']],
    ['AMAZON PRIME', 'ocio', ['#suscripcion']],
    ['ICLOUD', 'ocio', ['#suscripcion']],
    ['YOUTUBE PREMIUM', 'ocio', ['#suscripcion']],

    // Restauración / Delivery -> Ocio y Vicio (los patrones más específicos primero)
    ['UBER EATS', 'ocio', ['#delivery'], 480],
    ['JUST EAT', 'ocio', ['#delivery'], 480],
    ['GLOVO', 'ocio', ['#delivery']],
    ['TELEPIZZA', 'ocio', ['#delivery']],
    ['DOMINOS', 'ocio', ['#delivery']],
    ['MCDONALDS', 'ocio', []],
    ['BURGER KING', 'ocio', [], 480],
    ['KFC', 'ocio', []],
    ['STARBUCKS', 'ocio', []],
    [' BK ', 'ocio', [], 540], // patrón corto y ambiguo: se evalúa el último de este grupo

    // Transporte / Gasolina -> Extras e Imprevistos
    ['GASOLINERA', 'extras', []],
    ['REPSOL', 'extras', []],
    ['CEPSA', 'extras', []],
    ['GALP', 'extras', []],
    ['SHELL', 'extras', []],
    ['CABIFY', 'extras', []],
    ['RENFE', 'extras', []],
    ['UBER', 'extras', [], 540], // después de "UBER EATS" (más específico, prioridad 480)

    // Farmacia -> Supervivencia
    ['FARMACIA', 'supervivencia', []],
    ['FCIA', 'supervivencia', []],

    // Cultura / Cómics -> Cultura y Coleccionismo
    ['FNAC', 'cultura', []],
    ['GAME ', 'cultura', []],
    ['LIBRERIA', 'cultura', []],
    ['COMIC', 'cultura', []],
    ['STEAM', 'cultura', []],
    ['PLAYSTATION', 'cultura', []],
    ['XBOX', 'cultura', []],
    ['NINTENDO', 'cultura', []],

    // Ropa / Estética -> Ocio y Vicio
    ['ZARA', 'ocio', []],
    ['H&M', 'ocio', []],
    ['PRIMARK', 'ocio', []],
    ['MANGO', 'ocio', []],
    ['BERSHKA', 'ocio', []],
    ['STRADIVARIUS', 'ocio', []],
    ['PULL AND BEAR', 'ocio', []],
    ['PELUQUERIA', 'ocio', ['#estetica']],
    ['ESTETICA', 'ocio', ['#estetica']],

    // Extras / Bizum (pago entre particulares o aplazado: se asigna a Extras por
    // defecto, pero el usuario puede cambiarlo caso a caso; siempre queda la etiqueta
    // para encontrarlos fácilmente)
    ['BIZUM', 'extras', ['#bizum']],
    ['KLARNA', 'extras', ['#aplazado']],
    ['PAYPAL', 'extras', ['#paypal']],

    // Transferencias / Ingresos: solo etiqueta, sin forzar pilar ni tipo (podría ser
    // un ingreso real, un traspaso entre tus cuentas o un pago a un tercero; mejor que
    // quede en "por revisar" la primera vez para que el usuario lo decida una vez).
    ['NOMINA', null, ['#nomina']],
    ['SALARIO', null, ['#nomina']],
    ['TRANSFERENCIA', null, ['#transferencia']],
  ];

  // Genera una copia nueva con ids frescos cada vez (para poder restaurar sin
  // colisionar con reglas ya existentes).
  function build() {
    return DEFINITIONS.map(([pattern, pillar, tags, priority]) => ({
      id: Utils.uid('rule_default'),
      pattern,
      isRegex: false,
      // No se fuerza el tipo (gasto/ingreso/traspaso): ya lo determina de forma
      // fiable el signo del importe al importar. Forzarlo aquí podría, por ejemplo,
      // contar una nómina como gasto, o un reembolso de un comercio como gasto en
      // vez de como el ingreso que realmente es.
      type: null,
      pillar: pillar || null,
      subcategory: null,
      tags: tags || [],
      priority: priority || 500,
      active: true,
    }));
  }

  return { build };
})();
