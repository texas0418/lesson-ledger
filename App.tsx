import { useEffect, useState } from 'react';
import HomeScreen from './src/screens/HomeScreen';
import StudentsScreen from './src/screens/StudentsScreen';
import StudentScreen from './src/screens/StudentScreen';
import InvoiceScreen from './src/screens/InvoiceScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { SettingsProvider } from './src/SettingsContext';
import { initPurchases } from './src/proAccess';

type Screen =
  | { name: 'home' }
  | { name: 'students' }
  | { name: 'student'; studentId: number }
  | { name: 'invoice'; invoiceId: number; from: 'home' | 'student' }
  | { name: 'settings' };

function Root() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  if (screen.name === 'students')
    return (
      <StudentsScreen
        onBack={() => setScreen({ name: 'home' })}
        onOpenStudent={(studentId) => setScreen({ name: 'student', studentId })}
      />
    );
  if (screen.name === 'student')
    return (
      <StudentScreen
        studentId={screen.studentId}
        onBack={() => setScreen({ name: 'students' })}
        onOpenInvoice={(invoiceId) =>
          setScreen({ name: 'invoice', invoiceId, from: 'student' })
        }
      />
    );
  if (screen.name === 'invoice')
    return (
      <InvoiceScreen
        invoiceId={screen.invoiceId}
        onBack={(studentId) =>
          setScreen(
            screen.from === 'student' && studentId != null
              ? { name: 'student', studentId }
              : { name: 'home' },
          )
        }
      />
    );
  if (screen.name === 'settings')
    return <SettingsScreen onBack={() => setScreen({ name: 'home' })} />;
  return (
    <HomeScreen
      onOpenInvoice={(invoiceId) =>
        setScreen({ name: 'invoice', invoiceId, from: 'home' })
      }
      onOpenStudent={(studentId) => setScreen({ name: 'student', studentId })}
      onStudents={() => setScreen({ name: 'students' })}
      onSettings={() => setScreen({ name: 'settings' })}
    />
  );
}

export default function App() {
  useEffect(() => {
    // Fail-open: unlocks Pro immediately in Expo Go / placeholder builds.
    initPurchases();
  }, []);
  return (
    <SettingsProvider>
      <Root />
    </SettingsProvider>
  );
}
