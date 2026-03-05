import HeaderBar from './HeaderBar'
import Dashboard from './Dashboard'
import './FairWinsAppNew.css'

function FairWinsAppNew({ onConnect, onDisconnect }) {
  return (
    <div className="fairwins-app-new">
      <HeaderBar
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
      <main className="main-canvas">
        <Dashboard onConnect={onConnect} />
      </main>
    </div>
  )
}

export default FairWinsAppNew
