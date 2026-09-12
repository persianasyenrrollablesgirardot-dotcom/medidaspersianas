// GENERADO por `empresa-kb/scripts/procesos.sh exportar-evidencias`. NO editar a mano.
//
// La fuente es `conocimiento/procesos/evidencias.yaml` de la base de conocimiento.
// Si la app llevara su propia lista, las dos se separarian en la primera correccion y
// nadie se enteraria hasta que un reclamo se cayera por una prueba que la app no pedia.
//
// 14 evidencias · 4 contrapartes · generado del YAML.

export type FormatoEvidencia = 'foto' | 'video' | 'documento' | 'firma' | 'dato' | 'lista';

export interface EvidenciaDef {
  id: string;
  nombre: string;
  /** Rol interno o contraparte que la genera. */
  produce: string;
  /** Quien la reclama. `ley` no se negocia con nadie. */
  exigidoPor: string;
  /** Etapa de la cadena de gestion donde se captura. */
  etapa: string;
  etapaNombre: string;
  procesoNombre: string;
  formato: FormatoEvidencia;
  /** Se captura ANTES de que exista el problema que la va a necesitar. */
  anticipada: boolean;
  plazo?: string;
  bloquea: string;
  siFalta: string;
}

export const EVIDENCIAS: EvidenciaDef[] = [
  {
    id: 'EV-01',
    nombre: 'Medidas finales de fabricación declaradas',
    produce: 'tecnico',
    exigidoPor: 'safra',
    etapa: 'P-06.1',
    etapaNombre: 'Pedir al proveedor',
    procesoNombre: 'Pedido a proveedor y producción',
    formato: 'dato',
    anticipada: false,
    bloquea: 'Hacer el pedido al proveedor.',
    siFalta: 'No se pide. Un pedido con medida sin estado declarado es el origen del reclamo que después no se puede sostener, porque Safra no cubre fallas por fabricar fuera de sus especificaciones a solicitud del distribuidor.',
  },
  {
    id: 'EV-02',
    nombre: 'Fotografía de la caja antes de abrirla',
    produce: 'tecnico',
    exigidoPor: 'safra',
    etapa: 'P-06.4',
    etapaNombre: 'Puerta — revisar la caja el día que llega',
    procesoNombre: 'Pedido a proveedor y producción',
    formato: 'foto',
    anticipada: true,
    plazo: 'El día de la entrega. El reporte de novedad, máximo 4 días después.',
    bloquea: 'Reclamar a Safra un golpe, un faltante o un daño de transporte.',
    siFalta: 'Safra no responde: sin foto de la caja el golpe no es imputable al transporte y el costo queda del lado propio. La caja se bota al abrirla, así que la foto o se toma entonces o no existe nunca.',
  },
  {
    id: 'EV-03',
    nombre: 'Observación escrita y firmada en la guía de transporte',
    produce: 'transportadora',
    exigidoPor: 'safra',
    etapa: 'P-06.4',
    etapaNombre: 'Puerta — revisar la caja el día que llega',
    procesoNombre: 'Pedido a proveedor y producción',
    formato: 'documento',
    anticipada: true,
    plazo: 'En el momento de firmar el recibido. No se puede agregar después.',
    bloquea: 'Que Safra le reporte el daño a la transportadora.',
    siFalta: 'El daño de transporte deja de ser reclamable. Es el único momento en que se puede dejar constancia, y dura lo que dura la firma.',
  },
  {
    id: 'EV-04',
    nombre: 'Verificación de contenido contra el pedido',
    produce: 'tecnico',
    exigidoPor: 'safra',
    etapa: 'P-06.4',
    etapaNombre: 'Puerta — revisar la caja el día que llega',
    procesoNombre: 'Pedido a proveedor y producción',
    formato: 'lista',
    anticipada: false,
    plazo: '4 días para faltantes; 10 días para arrugas, marcas o error de especificación.',
    bloquea: 'Reclamar un faltante o un error de especificación de fábrica.',
    siFalta: 'Vencido el plazo, el faltante lo asume el distribuidor. Hay que revisar sistema, tela, color y contar soportes y accesorios, no solo mirar que la persiana esté.',
  },
  {
    id: 'EV-05',
    nombre: 'Medidas verificadas contra el vano antes de perforar',
    produce: 'instalador',
    exigidoPor: 'empresa',
    etapa: 'P-07.3',
    etapaNombre: 'Puerta — verificar antes de taladrar',
    procesoNombre: 'Instalación',
    formato: 'dato',
    anticipada: false,
    bloquea: 'Taladrar.',
    siFalta: 'No se perfora. Un agujero sobre una medida equivocada daña la obra del cliente, y ese daño no lo cubre nadie: Safra excluye expresamente los daños por accidentes en la instalación.',
  },
  {
    id: 'EV-06',
    nombre: 'Firma del cliente de que la cornamusa quedó instalada',
    produce: 'cliente',
    exigidoPor: 'ley',
    etapa: 'P-07.4',
    etapaNombre: 'Puerta — cornamusa instalada y firmada',
    procesoNombre: 'Instalación',
    formato: 'firma',
    anticipada: true,
    bloquea: 'Cerrar la instalación, y cualquier garantía de vertical, Hannas o Vintage.',
    siFalta: 'No se cierra la instalación. Es la Resolución 12667 de 2013 de la Superintendencia de Industria y Comercio, que existe porque hubo accidentes con niños: no depende de lo que acepte el cliente ni de lo que exija el proveedor.',
  },
  {
    id: 'EV-07',
    nombre: 'Foto de cada persiana instalada y nivelada',
    produce: 'instalador',
    exigidoPor: 'safra',
    etapa: 'P-07.5',
    etapaNombre: 'Ejecutar el alcance y solo el alcance',
    procesoNombre: 'Instalación',
    formato: 'foto',
    anticipada: true,
    bloquea: 'Escalar a Safra cualquier garantía futura de esa persiana.',
    siFalta: 'El día del reclamo hay que volver a sitio a tomarla, y si la persiana ya está descolgada o el cliente la manipuló, ya no prueba nada. Es una foto por persiana, no una del conjunto.',
  },
  {
    id: 'EV-08',
    nombre: 'Constancia de la capacitación de uso entregada',
    produce: 'instalador',
    exigidoPor: 'empresa',
    etapa: 'P-08.1',
    etapaNombre: 'Puerta — instalar no es cerrar',
    procesoNombre: 'Entrega, capacitación y cobro del saldo',
    formato: 'firma',
    anticipada: true,
    bloquea: 'Dar el proyecto por cerrado.',
    siFalta: 'Un motor sin programar o una cadena mal usada vuelven como reclamo de garantía que no es garantía, y sin constancia no hay cómo mostrar que se explicó.',
  },
  {
    id: 'EV-09',
    nombre: 'Diagnóstico de la visita previa al cliente',
    produce: 'tecnico',
    exigidoPor: 'safra',
    etapa: 'P-10.1',
    etapaNombre: 'Puerta — reunir la evidencia ANTES de reportar',
    procesoNombre: 'Escalar la garantía al proveedor',
    formato: 'documento',
    anticipada: false,
    bloquea: 'Reportar la garantía al asesor comercial.',
    siFalta: 'Safra no inicia el proceso. La visita previa es obligación del distribuidor: es donde se determina si el caso procede, antes de molestar al proveedor.',
  },
  {
    id: 'EV-10',
    nombre: 'Video o fotografía por persiana que demuestre la no conformidad',
    produce: 'tecnico',
    exigidoPor: 'safra',
    etapa: 'P-10.1',
    etapaNombre: 'Puerta — reunir la evidencia ANTES de reportar',
    procesoNombre: 'Escalar la garantía al proveedor',
    formato: 'foto',
    anticipada: false,
    bloquea: 'Que Safra emita dictamen técnico.',
    siFalta: 'Sin evidencia apropiada no hay dictamen, y el caso queda parado sin que nadie avise. Debe ser clara, congruente con lo que se reclama, y una por persiana.',
  },
  {
    id: 'EV-11',
    nombre: 'Imagen que muestre la persiana nivelada',
    produce: 'tecnico',
    exigidoPor: 'safra',
    etapa: 'P-10.1',
    etapaNombre: 'Puerta — reunir la evidencia ANTES de reportar',
    procesoNombre: 'Escalar la garantía al proveedor',
    formato: 'foto',
    anticipada: false,
    bloquea: 'Que Safra acepte el caso como defecto de producto.',
    siFalta: 'Safra puede atribuir la falla a instalación desnivelada, y en ese caso la garantía la asume el distribuidor. Es la foto que separa un defecto de fábrica de un error propio.',
  },
  {
    id: 'EV-12',
    nombre: 'Solicitud diligenciada ante el asesor comercial, con su número de identificación',
    produce: 'jhon',
    exigidoPor: 'safra',
    etapa: 'P-10.2',
    etapaNombre: 'Radicar por el canal del asesor comercial',
    procesoNombre: 'Escalar la garantía al proveedor',
    formato: 'documento',
    anticipada: false,
    bloquea: 'Que exista el caso para Safra.',
    siFalta: 'No hay proceso: es el único medio por el que Safra lo inicia. Y sin el número no se puede consultar el estado después.',
  },
  {
    id: 'EV-13',
    nombre: 'Lista de empaque que coincida con lo enviado',
    produce: 'jhon',
    exigidoPor: 'safra',
    etapa: 'P-10.3',
    etapaNombre: 'Puerta — despachar completo y con lista de empaque',
    procesoNombre: 'Escalar la garantía al proveedor',
    formato: 'documento',
    anticipada: false,
    bloquea: 'Que Safra evalúe el producto devuelto.',
    siFalta: 'No se evalúa y se devuelve el producto. Debe detallar descripción y cantidad, e ir con todos los componentes: un producto incompleto tampoco se evalúa.',
  },
  {
    id: 'EV-14',
    nombre: 'Certificado de los mantenimientos realizados',
    produce: 'cliente',
    exigidoPor: 'safra',
    etapa: 'P-10.1',
    etapaNombre: 'Puerta — reunir la evidencia ANTES de reportar',
    procesoNombre: 'Escalar la garantía al proveedor',
    formato: 'documento',
    anticipada: true,
    bloquea: 'Sostener la garantía frente a una exclusión por falta de mantenimiento.',
    siFalta: 'Safra puede excluir el caso por incumplimiento de mantenimiento, que es causal expresa. Hay que pedirlo al cliente, y por eso conviene habérselo explicado al entregar.',
  },
];
