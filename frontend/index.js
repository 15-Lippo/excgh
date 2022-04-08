// Variables
let userAddress, provider, signer;
let inputFlag;
let ExchangeABI, ExchangeContract;
let AggregatorV3InterfaceABI, EthereumPriceOracleContract;
let USDbABI, USDbContract, USDbWithSigner;
let ETHABI, ETHContract, ETHWithSigner;


// Elements
const connectWalletButton = document.getElementById("button-connect-wallet");
const ethSize = document.getElementById('eth-size');
const usdSize = document.getElementById('usd-size');
const limitPrice = document.getElementById('limit-price');
const feeValue = document.getElementById('fee-value');
const totalValue = document.getElementById('total-value');
const buyButton = document.getElementById('buy-button');
const sellButton = document.getElementById('sell-button');
const blockNumberValue = document.getElementById('block-number-value');


// Event listeners
document.addEventListener("DOMContentLoaded", onLoad);
connectWalletButton.addEventListener('click', connectWithMetamask);
ethSize.addEventListener('input', ethInputHandler);
usdSize.addEventListener('input', usdInputHandler);
limitPrice.addEventListener('input', limitInputHandler);
buyButton.addEventListener('mouseover', buyMouseoverHandler);
buyButton.addEventListener('mouseleave', buyMouseleaveHandler);
buyButton.addEventListener('click', buyHandler);
sellButton.addEventListener('mouseover', sellMouseoverHandler);
sellButton.addEventListener('mouseleave', sellMouseleaveHandler);
sellButton.addEventListener('click', sellHandler);
ethereum.on('accountsChanged', () => location.reload());


// Functions
/**
 * Function that loads after DOM content is loaded.
 * - Checks if MM is installed.
 * - If wallet is already connected, loads user address. 
 */
async function onLoad() {
  if (typeof window.ethereum !== 'undefined') {
    console.log('MetaMask is installed.');
    provider = new ethers.providers.Web3Provider(window.ethereum);
    const connected = await isMetamaskConnected();
    if (connected) {
      showAddress();
      signer = provider.getSigner();
      isRinkeby();

      // init Exchange contract
      ExchangeABI = await fetch('./abi/Exchange_ABI.json');
      ExchangeABI = await ExchangeABI.json();
      ExchangeContract = new ethers.Contract('0xBa46c2353fDd9cD075e4dc4bC9a0FA5Ef3112C4b', ExchangeABI, provider);
      ExchangeContractWithSigner = ExchangeContract.connect(signer);

      // init Price oracle contract
      AggregatorV3InterfaceABI = await fetch('./abi/AggregatorV3Interface_ABI.json');
      AggregatorV3InterfaceABI = await AggregatorV3InterfaceABI.json();
      EthereumPriceOracleContract = new ethers.Contract('0x8A753747A1Fa494EC906cE90E9f37563A8AF630e', AggregatorV3InterfaceABI, provider);

      // check if USDb is approved
      USDbABI = await fetch('./abi/USDb_ABI.json');
      USDbABI = await USDbABI.json();
      USDbContract = new ethers.Contract('0xF2DF8FBB35c7D837aA7866353989E15A094400e4', USDbABI, provider);
      USDbWithSigner = USDbContract.connect(signer);
      const canSpendUSDb = await userCanSpendUSDb();
      await initApproveBuyButton(canSpendUSDb);

      // check if ETH is approved
      ETHABI = await fetch('./abi/USDb_ABI.json');
      ETHABI = await ETHABI.json();
      ETHContract = new ethers.Contract('0x20c5c72bEE10051f923c3cFAbd744F0618b4B41f', ETHABI, provider);
      ETHWithSigner = ETHContract.connect(signer);
      const canSpendETH = await userCanSpendETH();
      await initApproveSellButton(canSpendETH);
    }

    provider.on('block', async (blockNumber) => {
      console.log(blockNumber);
      updateBlockNumber(blockNumber);
      if (!connected) {
        disableUserInput();
        return false;
      }

      // fetch and update the order book (OB)
      let orderbooks = await fetchOB();
      updateOB(orderbooks[0], orderbooks[1]);
      updateActiveOrders();
      updatePriceOracle();
    });


  } else {
    alert('Please install MetaMask!');
  }
}

/**
 * Checks if metamask is already connected to the website.
 * @return {boolean}
 */
async function isMetamaskConnected() {
  const accounts = await provider.listAccounts();
  return accounts.length > 0;
}

/**
 * Checks if MM's network is Rinkeby.
 * @return {boolean}
 */
async function isRinkeby() {
  const network = await provider.getNetwork();
  if (network.chainId != 4) {
    alert('Please switch the nework to "Rinkeby".')
    return false;
  }
  return true;
}

/**
 * Launches a MetaMask popup to allow users to connect their wallet.
 */
async function connectWithMetamask() {
  const connectedToRinkeby = await isRinkeby();
  if (!connectedToRinkeby) {
    return false;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  userAddress = accounts[0];
  showAddress();
}

/**
 * Replaces the text of "Connect wallet" to user's address.
 */
async function showAddress() {
  const accounts = await provider.listAccounts();
  userAddress = accounts[0];
  connectWalletButton.innerHTML = userAddress.slice(0, 4) + '...' + userAddress.slice(userAddress.length - 5, userAddress.length - 1);
}

/**
 * Updates #usd-size after a change in #eth-size.
 * A flag named `inputFlag` helps #limit-price change when input event fires.
 */
function ethInputHandler() {
  inputFlag = 'eth';
  if (!(Number(limitPrice.value) > 0) && (Number(usdSize.value) > 0)) {
    usdSize.value = '';
  } else if (Number(limitPrice.value) > 0) {
    let usdValue = Number(ethSize.value) * Number(limitPrice.value);
    usdValue = Math.round(usdValue * 100)/100;
    usdSize.value = usdValue;
  }
}

/**
 * Updates #eth-size after a change in #usd-size.
 * A flag named `inputFlag` helps #limit-price change when input event fires.
 */
function usdInputHandler() {
  inputFlag = 'usd';
  if (!(Number(limitPrice.value) > 0) && (Number(ethSize.value) > 0)) {
    ethSize.value = '';
  } else if (Number(limitPrice.value) > 0) {
    let ethValue = Number(usdSize.value) / Number(limitPrice.value)
    ethValue = Math.round(ethValue * 1000)/1000;
    ethSize.value = ethValue;
  }
}

/**
 * Updates #eth-size OR #usd-size depending on `inputFlag`.
 */
function limitInputHandler() {
  if (inputFlag == 'eth') {
    let usdValue = Number(ethSize.value) * Number(limitPrice.value);
    usdValue = Math.round(usdValue * 100)/100;
    usdSize.value = usdValue;
  } else if (inputFlag == 'usd') {
    let ethValue = Number(usdSize.value) / Number(limitPrice.value)
    ethValue = Math.round(ethValue * 1000)/1000;
    ethSize.value = ethValue;
  }
}

/**
 * When #buy-button is hovered, #fee-value and #total-value gets updated.
 * Dependent on #usd-size
 */
function buyMouseoverHandler() {
  if (Number(limitPrice.value) > 0 && (Number(ethSize.value) > 0)) {
    const fee = Math.round(usdSize.value * 1)/1000;
    const total = usdSize.value - fee;
    feeValue.innerHTML = fee.toLocaleString() + ' USD';
    totalValue.innerHTML = total.toLocaleString() + ' USD';
  }
}

/**
 * When #sell-button is hovered, #fee-value and #total-value gets updated.
 * Dependent on #eth-size
 */
function sellMouseoverHandler() {
  if (Number(limitPrice.value) > 0 && (Number(ethSize.value) > 0)) {
    const fee = (ethSize.value * 1)/1000;
    const total = ethSize.value - fee;
    feeValue.innerHTML = fee + ' ETH';
    totalValue.innerHTML = total + ' ETH';
  }
}

/**
 * Resets #fee-value and #total-value once mouse is no longer hovering 
 * #buy-button.
 */
function buyMouseleaveHandler() {
  feeValue.innerHTML = 'Hover over a button';
  totalValue.innerHTML = '-';
}

/**
 * Resets #fee-value and #total-value once mouse is no longer hovering 
 * #sell-button.
 */
function sellMouseleaveHandler() {
  feeValue.innerHTML = 'Hover over a button';
  totalValue.innerHTML = '-';
}

/**
 * Updates #block-number-value once new block is fetched.
 * @param {Number} blockNumber: Current block number.
 */
function updateBlockNumber(blockNumber) {
  blockNumberValue.innerHTML = blockNumber;
}

/**
 * Fetches `sellOB` and `buyOB` using the Exchange contract.
 */
async function fetchOB() {
  const orderbooks = await ExchangeContract.getPVobs();
  return orderbooks;
}

/**
 * Creates an order book (OB) row that has price and an order size.
 * @param {Number} price: Buy or sell price of the row.
 * @param {Number} orderSize: The corresponding order size for a price.
 * @returns {Element}: A <div> that is a row.
 */
function initOBRow(price, orderSize, side) {
  let rowDiv = document.createElement("div");
  rowDiv.classList.add('row');

  let priceDiv = document.createElement("div");
  priceDiv.classList.add('price');
  priceDiv.innerHTML = (price/100).toFixed(2);

  let orderSizeDiv = document.createElement("div");
  orderSizeDiv.classList.add('order-size');
  orderSize = orderSize/1000000
  if (side == 'sell') {
    orderSizeDiv.innerHTML = Math.trunc(orderSize*1000)/1000;
  } else if (side == 'buy') {
    orderSizeDiv.innerHTML = Math.trunc(orderSize/price*100*1000)/1000;
  }
  
  rowDiv.appendChild(priceDiv);
  rowDiv.appendChild(orderSizeDiv);

  return rowDiv;
}

/**
 * Creates an order book (OB) mid row where row has the value spread.
 * @param {Number} spread: Difference of highest buy and lowest sell.
 * @returns {Element}: A <div> that is the mid row.
 */
function initOBMidBar(spread) {
  let midBarDiv = document.createElement("div");
  midBarDiv.classList.add('mid-bar', 'header-cell-vertical');

  let spreadDiv = document.createElement("div");
  spreadDiv.classList.add('one');
  spreadDiv.innerHTML = spread;
  
  let textDiv = document.createElement("div");
  textDiv.classList.add('two');
  textDiv.innerHTML = 'Spread';

  midBarDiv.appendChild(spreadDiv);
  midBarDiv.appendChild(textDiv);

  return midBarDiv;
}

/**
 * Updates the order book (OB) by creating buy, mid, sell rows and replacing
 * the previous order book main component.
 * @param {Array} sellOB: An array where each element has a price {Number} and
 *  an order size {Number}.
 * @param {Array} sellOB: An array where each element has a price {Number} and
 *  an order size {Number}.
 */
function updateOB(sellOB, buyOB) {
  // init main component
  let OBDiv = document.createElement("div");
  OBDiv.classList.add('main');
  OBDiv.id = 'ob-table';

  // init sellOB
  let sellOBDiv = document.createElement("div");
  sellOBDiv.classList.add('sell-ob', 'sell-price');
  let lowestSellPrice = Number.MAX_VALUE;

  // init buyOB
  let buyOBDiv = document.createElement("div");
  buyOBDiv.classList.add('buy-ob', 'buy-price');
  let highestBuyPrice = -Number.MAX_VALUE;

  for (let i=0; i<sellOB.length; i++) {
    if (sellOB[i][1] > 0) {
      sellOBDiv.appendChild(initOBRow(sellOB[i][0], sellOB[i][1], 'sell'));
      // update lowestPrice
      if (lowestSellPrice > sellOB[i][0]) {
        lowestSellPrice = sellOB[i][0];
      }
    }
    if (buyOB[i][1] > 0) {
      buyOBDiv.appendChild(initOBRow(buyOB[i][0], buyOB[i][1], 'buy'));
      if (highestBuyPrice < buyOB[i][0]) {
        highestBuyPrice = buyOB[i][0];
      }
    }
  }

  const midBarDiv = initOBMidBar((lowestSellPrice - highestBuyPrice)/100);

  OBDiv.appendChild(sellOBDiv);
  OBDiv.appendChild(midBarDiv);
  OBDiv.appendChild(buyOBDiv);

  let obTable = document.getElementById('ob-table');
  const parentDiv = obTable.parentNode;

  parentDiv.replaceChild(OBDiv, obTable);
}

/**
 * Creates an buy-row that has a side (BUY/SELL), Price (USD), Size (ETH), 
 * Total value (USD) and an action to cancel the order.
 * @param {Array} order: [txHash, price, size]
 * @param {String} side: 'buy' or 'sell'
 * @returns {Element}: A <div> that is a buy-row.
 */
async function initActiveOrderRow(order, side) {
  let rowDiv = document.createElement("div");
  rowDiv.classList.add('row', 'value-cell-vertical');

  let sideDiv = document.createElement("div");
  if (side == 'buy') {
    sideDiv.classList.add('buy-side', 'one');
    sideDiv.innerHTML = 'BUY';
  } else if (side == 'sell') {
    sideDiv.classList.add('sell-side', 'one');
    sideDiv.innerHTML = 'SELL';
  }

  let priceDiv = document.createElement("div");
  priceDiv.classList.add('two');
  const price = (order[1]/100).toFixed(2);
  priceDiv.innerHTML = price;

  let sizeDiv = document.createElement("div");
  sizeDiv.classList.add('three');
  const actualSize = (parseInt(order[2]._hex, 16)/1000000);
  const size = Math.trunc((parseInt(order[2]._hex, 16)/1000000)*1000)/1000;
  if (side == 'buy') {
    sizeDiv.innerHTML = Math.trunc(actualSize/price*1000)/1000;
  } else if (side == 'sell') {
    sizeDiv.innerHTML = size;
  }
  

  let valueDiv = document.createElement("div");
  valueDiv.classList.add('four');
  if (side == 'buy') {
    valueDiv.innerHTML = (actualSize*1).toFixed(2);
  } else if (side == 'sell') {
    valueDiv.innerHTML = Math.trunc(price * actualSize*100)/100;
  }

  let actionDiv = document.createElement("div");
  actionDiv.classList.add('five');

  // TODO
  // add functionality (tx data (data[0])) to cancel
  let cancelButton = document.createElement("button");
  cancelButton.classList.add('sell-price', 'cancel-button');
  cancelButton.innerHTML = 'Cancel';
  actionDiv.appendChild(cancelButton);

  rowDiv.appendChild(sideDiv);
  rowDiv.appendChild(priceDiv);
  rowDiv.appendChild(sizeDiv);
  rowDiv.appendChild(valueDiv);
  rowDiv.appendChild(actionDiv);

  return rowDiv;
}

/**
 * Updates 'active orders' by creating new rows and replacing the current 
 * table with the newly created one.
 */
async function updateActiveOrders() {
  const activeBuyOrders = await ExchangeContract.activeBuyOrders({from:userAddress});
  const activeSellOrders = await ExchangeContract.activeSellOrders({from:userAddress});

  // init main component
  let mainDiv = document.createElement("div");
  mainDiv.id = 'active-orders-main';

  for (let i=0; i<activeBuyOrders.length; i++) {
    mainDiv.appendChild(await initActiveOrderRow(activeBuyOrders[i], 'buy'));
  }

  for (let i=0; i<activeSellOrders.length; i++) {
    mainDiv.appendChild(await initActiveOrderRow(activeSellOrders[i], 'sell'));
  }

  let currentTable = document.getElementById('active-orders-main');
  const parentDiv = currentTable.parentNode;

  parentDiv.replaceChild(mainDiv, currentTable);
}

/**
 * Updates the price oracle using 'Chainlik Ethereum Data Feeds':
 * https://docs.chain.link/docs/ethereum-addresses/
 */
async function updatePriceOracle() {
  const priceOracleValue = document.getElementById('price-oracle-value');
  priceOracleValue.innerHTML = '$' + (parseInt((await EthereumPriceOracleContract.latestAnswer())._hex, 16)/100000000).toFixed(2);
}

/**
 * Check if Exchange contract can spend user address's USDb
 * @returns {boolean}
 */
async function userCanSpendUSDb() {
  const allowance = parseInt((await USDbContract.getAllowance(userAddress, '0xBa46c2353fDd9cD075e4dc4bC9a0FA5Ef3112C4b'))._hex, 16);
  if (allowance > 1000000000000) return true;
  return false;
}

/**
 * Initialise "Approve USDb" button
 * @param {boolean} userCanSpend: true if Exchange contract can spend USDb
 */
async function initApproveBuyButton(userCanSpend) {
  if (userCanSpend) return;
  buyButton.innerHTML = 'Approve USDb';
  buyButton.addEventListener('click', approveUSD);
}

/**
 * Make the approve-usdb-button ready to make a write call for Exchange 
 *  contract to be able to spend user's USDb.
 */
async function approveUSD() {
  const tx = await USDbWithSigner.approve('0xBa46c2353fDd9cD075e4dc4bC9a0FA5Ef3112C4b', '115792089237316195423570985008687907853269984665640564039457584007913129639935');
  buyButton.innerHTML = 'Approving...';
  const receipt = await tx.wait();
  if (receipt.status == 1) {
    buyButton.innerHTML = 'Buy ETH';
    buyButton.removeEventListener('click', approveUSD);
  }
}

/**
 * Check if Exchange contract can spend user address's ETH
 * @returns {boolean}
 */
async function userCanSpendETH() {
  const allowance = parseInt((await USDbContract.getAllowance(userAddress, '0xBa46c2353fDd9cD075e4dc4bC9a0FA5Ef3112C4b'))._hex, 16);
  if (allowance > 1000000000000) return true;
  return false;
}

/**
 * Initialise "Approve ETH" button
 * @param {boolean} userCanSpend: true if Exchange contract can spend ETH
 */
async function initApproveSellButton(userCanSpend) {
  if (userCanSpend) return;
  sellButton.innerHTML = 'Approve ETH';
  sellButton.addEventListener('click', approveETH);
}

/**
 * Make the approve-eth-button ready to make a write call for Exchange 
 *  contract to be able to spend user's ETH.
 */
async function approveETH() {
  const tx = await ETHWithSigner.approve('0xBa46c2353fDd9cD075e4dc4bC9a0FA5Ef3112C4b', '115792089237316195423570985008687907853269984665640564039457584007913129639935');
  sellButton.innerHTML = 'Approving...';
  const receipt = await tx.wait();
  if (receipt.status == 1) {
    sellButton.innerHTML = 'Sell ETH';
    sellButton.removeEventListener('click', approveETH);
  }
}

/**
 * Fires when wallet is not connected. 
 * Disables: input, button
 */
function disableUserInput() {
  var buttons = document.getElementsByTagName("button");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].disabled = true;
  }
  connectWalletButton.disabled = false;
  ethSize.disabled = true;
  usdSize.disabled = true;
  limitPrice.disabled = true;
  feeValue.innerHTML = '-';
}

/**
 * Makes a new buy order.
 * Checks if PVnode for that price exist; if not, creates one. 
 */
async function buyHandler() {
  // empty input validation
  if (ethSize.value == '' || usdSize.value == '' || limitPrice.value == '') return false;
  
  // check if PVnode for the limit price already exist
  const orderbooks = await fetchOB();
  const orderbook = orderbooks[0];
  let index;
  let _limitPrice = Math.round(limitPrice.value*100);
  let doesPVnodeExist = false;
  for (let i=0; i<orderbook.length; i++) {
    if (orderbook[i][0] == _limitPrice) {
      doesPVnodeExist = true;
      index = i;
      break;
    };
  }

  if (!doesPVnodeExist) {
    const tx = await ExchangeContractWithSigner.initPVnode(_limitPrice);
    buyButton.innerHTML = 'Loading...';
    await tx.wait()
    buyButton.innerHTML = 'Please confirm again';
    index = orderbook.length;
  }

  // make new buy order
  await ExchangeContractWithSigner.newBuyOrder(_limitPrice, ethSize.value * 10000,index);
  buyButton.innerHTML = 'Buy ETH';
}

/**
 * Makes a new sell order.
 * Checks if PVnode for that price exist; if not, creates one. 
 */
async function sellHandler() {
  // empty input validation
  if (ethSize.value == '' || usdSize.value == '' || limitPrice.value == '') return false;
  
  // check if PVnode for the limit price already exist
  const orderbooks = await fetchOB();
  const orderbook = orderbooks[0];
  let index;
  let _limitPrice = Math.round(limitPrice.value*100);
  let doesPVnodeExist = false;
  for (let i=0; i<orderbook.length; i++) {
    if (orderbook[i][0] == _limitPrice) {
      doesPVnodeExist = true;
      index = i;
      break;
    };
  }

  if (!doesPVnodeExist) {
    const tx = await ExchangeContractWithSigner.initPVnode(_limitPrice);
    sellButton.innerHTML = 'Loading...';
    await tx.wait()
    sellButton.innerHTML = 'Please confirm again';
    index = orderbook.length;
  }

  // make new sell order
  await ExchangeContractWithSigner.newSellOrder(_limitPrice, ethSize.value * 1000000, index);
  sellButton.innerHTML = 'Sell ETH';
}