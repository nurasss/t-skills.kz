export function resourceBelongsToViewer(resourceOwnerId: string, viewerUserId: string) {
  return resourceOwnerId.length > 0 && viewerUserId.length > 0 && resourceOwnerId === viewerUserId;
}
