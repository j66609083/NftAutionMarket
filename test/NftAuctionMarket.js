const {expect} = require('chai');
const hre = require('hardhat');
const {time, loadFixture} = require("@nomicfoundation/hardhat-toolbox/network-helpers");


describe("NftAuctionMarket", function (){
    async function deployNftAuctionMarketFixture(){
        await hre.deployments.fixture(['depolyNftAuctionMarket']);
        const nftAuctionMarketProxy = await hre.deployments.get('NftAuctionMarketProxy');
        console.log("NftAuctionMarket deployed to:", nftAuctionMarketProxy.address);
        // console.log(hre.deployments);
        return {nftAuctionMarketProxy};
    }

    it("Should deploy NftAuctionMarket via proxy", async function(){
        const { nftAuctionMarketProxy } = await loadFixture(deployNftAuctionMarketFixture);
        const { deployer } = await hre.getNamedAccounts();
        accounts = await ethers.getSigners();
        // accounts[0]是地址对象，可以直接调用合约
        console.log("signer 0 : " + accounts[0].address)
        // deployer是地址字符串，不能直接调用合约
        console.log("deployer ：" + deployer)
        // 创建可交互的合约实例
        // 参数 1: ABI (定义了合约方法)
        // 参数 2: 地址 (合约实际在哪里)
        // 参数 3: 签名者 (谁来发送交易)
        const auctionMarketInstance = await ethers.getContractAt(
            nftAuctionMarketProxy.abi, 
            nftAuctionMarketProxy.address, 
            accounts[0]
        );
        const actualOwner = await auctionMarketInstance.owner();
        // 检查代理合约地址是否正确
        expect(nftAuctionMarketProxy.address).to.properAddress;
        // 代理合约拥有者应该是部署者
        expect(actualOwner).to.equal(deployer);
    })

    it("Create auction", async function(){
        const { nftAuctionMarketProxy } = await loadFixture(deployNftAuctionMarketFixture);
        const [deployer, seller, bidder1, bidder2] = await ethers.getSigners()
        expect(nftAuctionMarketProxy.address).to.properAddress;

        const auctionMarketInstance = await ethers.getContractAt(
            nftAuctionMarketProxy.abi, 
            nftAuctionMarketProxy.address
        );


        // 部署 ERC721 合约
        const PetNFT = await ethers.getContractFactory("PetNFT");
        const petNft = await PetNFT.deploy();
        await petNft.waitForDeployment();
        const petNftAddress = await petNft.getAddress();
        console.log("petNftAddress: ", petNftAddress);

        // mint 10个 NFT
        for (let i = 0; i < 10; i++) {
            await petNft.mintNFT(seller, "https://aqua-quiet-flamingo-250.mypinata.cloud/ipfs/bafkreidshus3wedppt4x2ocqn46z7jtkkxfpkwov4mwuxjbx4yrnjww4p4");
        }

        // 给代理合约授权
        await petNft.connect(seller).setApprovalForAll(nftAuctionMarketProxy.address, true);
        // NFT ID
        const tokenId = 1;  
        await auctionMarketInstance.connect(seller).createAuction(
            15,  // 持续时长
            ethers.parseEther("0.01"),  // 起拍价
            petNftAddress, // NFT合约地址
            tokenId  // NFT ID
        );
        let auction = await auctionMarketInstance.getAuction(0);
        expect(auction[0]).to.equal(seller.address);
        expect(auction[7]).to.equal(petNftAddress);
        expect(auction[8]).to.equal(tokenId);

        const MyERC20Token = await ethers.getContractFactory("MyERC20Token");
        const myERC20Token = await MyERC20Token.deploy();
        await myERC20Token.waitForDeployment();
        const erc20TokenAddress = await myERC20Token.getAddress();

        // mock预言机价格
        const mockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator")
        const priceFeedEthDeploy = await mockV3Aggregator.deploy(ethers.parseEther("10000"))
        const priceFeedEth = await priceFeedEthDeploy.waitForDeployment()
        const priceFeedEthAddress = await priceFeedEth.getAddress()
        console.log("ethFeed: ", priceFeedEthAddress)
        const priceFeedFTKDeploy = await mockV3Aggregator.deploy(ethers.parseEther("1"))
        const priceFeedFTK = await priceFeedFTKDeploy.waitForDeployment()
        const priceFeedFTKAddress = await priceFeedFTK.getAddress()
        console.log("FTKFeed: ", priceFeedFTKAddress)
        console.log("erc20TokenAddress: ", erc20TokenAddress)

        // 设置价格预言机
        await auctionMarketInstance.connect(deployer).setPriceFeed(ethers.ZeroAddress, priceFeedEthAddress);
        await auctionMarketInstance.connect(deployer).setPriceFeed(erc20TokenAddress, priceFeedEthAddress);
        console.log("Token Contract Target Address:", await myERC20Token.getAddress());
        console.log("Deployer Address:", deployer.address);
        console.log("Bidder1 Address:", bidder1.address);
        // 准备数据，给出价者分发ERC20代币
        let tx = await myERC20Token.connect(deployer).mint(bidder1.address, ethers.parseEther("1000"))
        await tx.wait();
        // 准备数据，给出价者分发ERC20代币
        tx = await myERC20Token.connect(deployer).mint(bidder2.address, ethers.parseEther("1000"))
        await tx.wait();

        // 购买者参与拍卖
        // ETH参与竞价（出价者1）
        tx = await auctionMarketInstance.connect(bidder1).placeBid(0, ethers.ZeroAddress, 0,
            { value: ethers.parseEther("0.01") });
        await tx.wait();
        // FTK参与竞价（出价者1）
        tx = await myERC20Token.connect(bidder1).approve(nftAuctionMarketProxy.address, ethers.MaxUint256)
        await tx.wait();
        tx = await auctionMarketInstance.connect(bidder1).placeBid(0, erc20TokenAddress, ethers.parseEther("101"));
        await tx.wait()
        
        // FTK参与竞价（出价者2）
        tx = await myERC20Token.connect(bidder2).approve(nftAuctionMarketProxy.address, ethers.MaxUint256)
        await tx.wait();
        tx = await auctionMarketInstance.connect(bidder2).placeBid(0, erc20TokenAddress, ethers.parseEther("105"));
        await tx.wait()

        let placeBidPromise1 = auctionMarketInstance.connect(bidder1).placeBid(0, erc20TokenAddress, ethers.parseEther("101"));
        await expect(placeBidPromise1).to.be.revertedWith("Bid must be higher than the current highest bid");

        // 等待 20 s
        // await new Promise((resolve) => setTimeout(resolve, 15 * 1000));
        time.increaseTo(await time.latest() + 15);

        let placeBidPromise = auctionMarketInstance.connect(bidder2).placeBid(0, erc20TokenAddress, ethers.parseEther("105"));
        await expect(placeBidPromise).to.be.revertedWith("Auction has ended");

        // 结束拍卖
        await auctionMarketInstance.connect(seller).endAuction(0);

        // 验证结果
        const auctionResult = await auctionMarketInstance.getAuction(0);
        expect(auctionResult[5]).to.equal(bidder2.address);
        expect(auctionResult[6]).to.equal(ethers.parseEther("105"));

        placeBidPromise = auctionMarketInstance.connect(bidder2).placeBid(0, erc20TokenAddress, ethers.parseEther("105"));
        await expect(placeBidPromise).to.be.revertedWith("Auction has ended");

        // NFT ID
        const tokenId2 = 2;  
        tx = await auctionMarketInstance.connect(seller).createAuction(
            15,  // 持续时长
            ethers.parseEther("0.01"),  // 起拍价
            petNftAddress, // NFT合约地址
            tokenId2  // NFT ID
        );

        const receipt = await tx.wait();
        let createdAuctionId;
        // 遍历回执中的 Logs，查找名为 "AuctionCreated" 的事件
        for (const log of receipt.logs) {
            // 尝试解析 log。如果 log 不是来自 auctionMarketInstance 可能会返回 null
            const parsedLog = auctionMarketInstance.interface.parseLog(log);
            if (parsedLog && parsedLog.name === "AuctionCreated") {
                // 4. 从解析后的事件参数中提取 auctionId
                // auctionId 是事件参数中的第一个 (索引 0)
                createdAuctionId = parsedLog.args[0]; 
                break; 
            }
        }

        console.log("auctionId2: ", createdAuctionId);
        // 购买者参与拍卖
        // ETH参与竞价（出价者1）
        tx = await auctionMarketInstance.connect(bidder1).placeBid(1, ethers.ZeroAddress, 0,
            { value: ethers.parseEther("0.01") });
        await tx.wait();

        const auctionIds = await auctionMarketInstance.connect(bidder1).getAuctionIds();
        console.log("auctionIds: ", auctionIds);
        expect(auctionIds.length).to.equal(2);

        const endAuctionExceptionPromise = auctionMarketInstance.connect(seller).endAuction(1);
        await expect(endAuctionExceptionPromise).to.be.revertedWith("Auction has not ended");

        const endAuctionExceptionPromise2 = auctionMarketInstance.connect(bidder1).endAuction(1);
        await expect(endAuctionExceptionPromise2).to.be.revertedWith("Only auction owner can call this function");

        // 等待 20 s
        // await new Promise((resolve) => setTimeout(resolve, 15 * 1000));
        time.increaseTo(await time.latest() + 15);
        // 结束拍卖
        await auctionMarketInstance.connect(seller).endAuction(1);

        
        // NFT ID
        const tokenId3 = 2;  
        let createAuctionPromise3 = auctionMarketInstance.connect(seller).createAuction(
            8,  // 持续时长
            ethers.parseEther("0.01"),  // 起拍价
            petNftAddress, // NFT合约地址
            tokenId3  // NFT ID
        );
        await expect(createAuctionPromise3).to.be.revertedWith("Duration must be greater than 10s");

        const tokenId4 = 2;  
        let createAuctionPromise4 = auctionMarketInstance.connect(seller).createAuction(
            15,  // 持续时长
            ethers.parseEther("0"),  // 起拍价
            petNftAddress, // NFT合约地址
            tokenId4  // NFT ID
        );
        await expect(createAuctionPromise4).to.be.revertedWith("Start price must be greater than 0");


        let setPriceFeedPromise = auctionMarketInstance.connect(deployer).setPriceFeed(ethers.ZeroAddress, ethers.ZeroAddress);
        await expect(setPriceFeedPromise).to.be.revertedWith("Invalid feed address");

        setPriceFeedPromise = auctionMarketInstance.connect(seller).setPriceFeed(ethers.ZeroAddress, ethers.ZeroAddress);
        await expect(setPriceFeedPromise).to.be.reverted;

        let initPromise = auctionMarketInstance.connect(seller).initialize();
        await expect(initPromise).to.be.reverted;
    })
})