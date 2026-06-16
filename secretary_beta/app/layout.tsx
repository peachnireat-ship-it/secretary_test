import { Providers } from './providers';
import { Header, Sidebar } from '../components';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>
        <Providers>
          <Header />
          <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
            <Sidebar />
            <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
