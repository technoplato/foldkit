import { Runtime } from 'foldkit'

import { makeCasinoApplication } from './application.js'
import './styles.css'

Runtime.run(makeCasinoApplication(document.getElementById('root')))
