const { deployments, upgrades, ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { save } = deployments;
    const { deployer } = await getNamedAccounts();
    console.log("部署用户地址：", deployer);
    const signers = await ethers.getSigners();
    console.log("部署用户地址：", signers[0].address);
    const NftAuctionMarket = await ethers.getContractFactory("NftAuctionMarket");
    // 通过代理合约部署
    const nftAuctionProxy = await upgrades.deployProxy(NftAuctionMarket, [], {
        initializer: "initialize",
        kind:"uups"
    });

    // 等待部署并获取最终地址
    await nftAuctionProxy.waitForDeployment(); 
    const proxyAddress = await nftAuctionProxy.getAddress();
    console.log("代理合约地址：", proxyAddress);    
    const actualOwner = await nftAuctionProxy.owner();
    console.log("代理合约拥有者：", actualOwner);    
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("实现合约地址：", implAddress);
  
    const storePath = path.resolve(__dirname, "../cache/proxyNftAuction.json");
    fs.writeFileSync(
        storePath,
        JSON.stringify({
        proxyAddress,
        implAddress,
        abi: NftAuctionMarket.interface.format("json"),
        })
    );
    await save("NftAuctionMarketProxy", {
        abi: NftAuctionMarket.interface.format("json"),
        address: proxyAddress
    })
};

module.exports.tags = ["depolyNftAuctionMarket"];