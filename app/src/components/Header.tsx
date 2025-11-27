import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="arena-header">
      <div className="arena-header__content">
        <div className="arena-header__copy">
          <p className="arena-badge">Blind Logic Arena</p>
          <h1>
            Solve the encrypted maze.
            <br />
            Earn hidden rewards.
          </h1>
          <p>
            Every player starts with 100 encrypted points. Clear the exact path
            (1-3-2-2) without revealing a thing and double your balance.
          </p>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
