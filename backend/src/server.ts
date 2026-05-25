import { loadRemoteConfig } from './config/remoteConfig';

void loadRemoteConfig().then(() => import('./main'));
