import { useState } from 'react';
import { TopNav } from './components/layout/TopNav';
import { EventsPage } from './pages/EventsPage';
import { InventoryPage } from './pages/InventoryPage';
import { KioskPage } from './pages/KioskPage';

type View = 'events' | 'inventory' | 'kiosk';

function App() {
  const [view, setView] = useState<View>('events');

  if (view === 'kiosk') {
    return <KioskPage onExit={() => setView('events')} />;
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <TopNav activeTab={view} onTabChange={setView} />
      {view === 'events' ? <EventsPage /> : <InventoryPage />}
    </div>
  );
}

export default App;
