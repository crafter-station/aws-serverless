import { existsSync } from 'node:fs';

/*
  ¿Tiene audio esta ficha?

  El audio se genera a mano y no todas las fichas lo tienen al día. El botón
  solo aparece cuando el fichero existe: prometer un reproductor que devuelve
  404 es peor que no ofrecerlo.
*/
export const hayAudio = (coleccion: string, id: string) =>
  existsSync(`public/audio/${coleccion}/${id}.mp3`);
