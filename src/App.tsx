import { useState } from 'react';
import { TopNav } from './components/layout/TopNav';
import { EventsPage } from './pages/EventsPage';
import { InventoryPage } from './pages/InventoryPage';
import { KioskPage } from './pages/KioskPage';
import type { BazaarlyEvent } from './lib/types';

type View = 'events' | 'inventory' | 'kiosk';

function App() {
  const [view, setView] = useState<View>('events');
  const [selectedEvent, setSelectedEvent] = useState<BazaarlyEvent | null>(null);

  if (view === 'kiosk') {
    return <KioskPage onExit={() => { setSelectedEvent(null); setView('events'); }} />;
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <TopNav
        activeTab={view}
        onTabChange={tab => {
          setView(tab);
          setSelectedEvent(null);
        }}
      />
      {view === 'events' ? (
        <EventsPage
          selectedEvent={selectedEvent}
          onSelectEvent={setSelectedEvent}
          onCloseDashboard={() => setSelectedEvent(null)}
        />
      ) : <InventoryPage />}
    </div>
  );
}

export default App;
