const { ethers, deployments, upgrades } = require("hardhat");
const { expect } = require("chai");

describe("Test upgrade", async function () {
  it("Should be able to deploy", async function () {
    const [signer, buyer] = await ethers.getSigners()

    // 1. 部署业务合约
    await deployments.fixture(["depolyNftAuctionMarket"]);

    const nftAuctionProxy = await deployments.get("NftAuctionMarketProxy");
    console.log(nftAuctionProxy)


    // 部署 ERC721 合约
    const PetNFT = await ethers.getContractFactory("PetNFT");
    const petNft = await PetNFT.deploy();
    await petNft.waitForDeployment();
    const petNftAddress = await petNft.getAddress();
    console.log("petNftAddress: ", petNftAddress);

    // mint 10个 NFT
    for (let i = 0; i < 10; i++) {
        await petNft.mintNFT(signer.address, "https://aqua-quiet-flamingo-250.mypinata.cloud/ipfs/bafkreidshus3wedppt4x2ocqn46z7jtkkxfpkwov4mwuxjbx4yrnjww4p4");
    }

    const tokenId = 1;    

    // 给代理合约授权
    await petNft.connect(signer).setApprovalForAll(nftAuctionProxy.address, true);

    // 2. 调用 createAuction 方法创建拍卖
    const nftAuction = await ethers.getContractAt(
      "NftAuctionMarket",
      nftAuctionProxy.address
    );

    await nftAuction.createAuction(
      100 * 1000,
      ethers.parseEther("0.01"),
      petNftAddress,
      1
    );

    const auction = await nftAuction.getAuction(0);
    console.log("创建拍卖成功：：", auction);

    const implAddress1 = await upgrades.erc1967.getImplementationAddress(
      nftAuctionProxy.address
    );
    // 3. 升级合约
    await deployments.fixture(["upgradeNftAuctionMarket"]);

    const implAddress2 = await upgrades.erc1967.getImplementationAddress(
      nftAuctionProxy.address
    );
    // 4. 读取合约的 auction[0]
    const auction2 = await nftAuction.getAuction(0);
    console.log("升级后读取拍卖成功：：", auction2);

    console.log("implAddress1::", implAddress1, "\nimplAddress2::", implAddress2);
    
    const nftAuctionV2 = await ethers.getContractAt(
        "NftAuctionMarketV2",
        nftAuctionProxy.address
      );
    const hello = await nftAuctionV2.testHello()
    console.log("hello::", hello);
    
    // console.log("创建拍卖成功：：", await nftAuction.auctions(0));
    expect(auction2.startTime).to.equal(auction.startTime);
    // expect(implAddress1).to.not(implAddress2);
  });
});