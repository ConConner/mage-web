import type { Project } from '@core/project/Project';
import { assetKindOf, type AssetKind } from '@core/project/assets';
import { MANIFEST_FILE } from '@core/project/codec';
import type { EditorInput, EditorKind } from '../services/EditorService';
import { roomEditorId } from '../editors/room/RoomEditorService';
import { hex } from '../components/controls';
import { assetTitle } from '../editors/assetHooks';

const EDITOR_FOR: Record<AssetKind, EditorKind> = {
  room: 'room',
  area: 'area',
  tileset: 'tileset',
  tilemap: 'tilemap',
  tiletable: 'tileTable',
  palette: 'palette',
  graphics: 'graphics',
  spriteset: 'spriteset',
  sprite: 'sprite',
};

/** The editor tab that shows a project file, or undefined if it has none. */
export function editorInputFor(project: Project, path: string): EditorInput | undefined {
  if (path === MANIFEST_FILE) return { id: 'project', kind: 'project', title: project.name, params: {}, description: 'Project' };
  const kind = assetKindOf(path);
  if (!kind) return undefined;
  if (kind === 'room') {
    const r = project.get(path, 'room');
    if (!r) return undefined;
    return { id: roomEditorId(r.area, r.index), kind: 'room', title: `${project.areaName(r.area)} ${hex(r.index)}`, params: { area: r.area, room: r.index }, description: path };
  }
  return { id: `asset:${path}`, kind: EDITOR_FOR[kind], title: assetTitle(path), params: { path }, description: path };
}

export function assetEditorId(project: Project, path: string): string | undefined {
  return editorInputFor(project, path)?.id;
}

/** Room properties of a room asset. */
export function roomPropertiesInput(path: string): EditorInput {
  return { id: `props:${path}`, kind: 'roomProperties', title: `${assetTitle(path)} properties`, params: { path }, description: path };
}
