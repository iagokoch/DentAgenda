import Icon from './Icon';
export default function Brand({ compact = false }) { return <div className={`brand ${compact ? 'brand--compact' : ''}`}>{!compact && <span className="brand__mark"><Icon name="tooth" size={25}/></span>}<span>DentAgenda</span></div>; }
