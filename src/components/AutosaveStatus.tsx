import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

export function AutosaveStatus() {
  const latest = useLiveQuery(async () => {
    const projects = await db.projects.orderBy('updatedAt').reverse().limit(1).toArray();
    return projects[0];
  });

  if (!latest) return null;

  return (
    <div className="autosave-status" title="Los datos se guardan localmente en este dispositivo">
      <span />
      Guardado local
    </div>
  );
}
