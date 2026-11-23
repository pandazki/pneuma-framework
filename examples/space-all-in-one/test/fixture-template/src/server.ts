import { serve } from '../sdk/serve.ts';

serve(({ res }) => void res.writeHead(200, { 'content-type': 'text/plain' }).end('hello'));
