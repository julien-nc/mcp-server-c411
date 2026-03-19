import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

type CookieJarAxiosConfig = CreateAxiosDefaults & {
  jar: CookieJar;
};

export function createHttpClient(config: CookieJarAxiosConfig): AxiosInstance {
  const wrappedAxios = wrapper(axios as never) as typeof axios;
  return wrappedAxios.create(config as never) as AxiosInstance;
}
