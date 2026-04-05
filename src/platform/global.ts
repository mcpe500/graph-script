import { Platform } from './interface';
import { NodePlatform } from './node';

let activePlatform: Platform = new NodePlatform();

export function setPlatform(platform: Platform): void {
  activePlatform = platform;
}

export function getPlatform(): Platform {
  return activePlatform;
}
