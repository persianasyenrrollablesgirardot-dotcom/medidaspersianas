# App Tecnica Campo Juno

PWA offline-first para levantamiento tecnico de campo, pensada para persianas, cortinas y sistemas relacionados.

## Enfoque

La app no es CRM comercial. Su foco es capturar datos tecnicos de terreno para cotizacion rapida opcional, ensamble, fabricacion, instalacion, evidencia y sincronizacion futura.

## Modelo

```text
Proyecto tecnico
  -> Espacio
    -> Ventana / vano
      -> Solucion tecnica
        -> Cotizacion rapida opcional
        -> Parametros de fabricacion
        -> Divisiones independientes
        -> Motorizacion
        -> Alertas tecnicas
```

## Funciones MVP

- Trabajo local con IndexedDB/Dexie.
- Proyectos tecnicos.
- Espacios por proyecto.
- Ventanas por espacio.
- Soluciones internas/externas/muro/techo/marco.
- Modo rapido con m2 y precio por m2 opcional.
- Modo tecnico con fabricacion, montaje, sistema, tela, perfil, soporte y divisiones.
- Reglas iniciales de validacion tecnica.
- Exportacion JSON, importacion JSON, CSV y resumen tecnico.

## Scripts

```bash
npm run dev
npm run build
```
