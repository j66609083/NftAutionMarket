// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract NftAuctionMarket is Initializable, UUPSUpgradeable, OwnableUpgradeable {

    // 拍卖结构体
    struct Auction {
        // 卖家地址
        address seller;  
        // 拍卖持续时间(秒)  
        uint256 duration;     
        // 拍卖开始时间
        uint256 startTime;      
        // 拍卖结束时间
        uint256 endTime;        
        // 起拍价
        uint256 startPrice;     
        // 最高出价者
        address highestBidder;  
        // 最高出价
        uint256 highestBid;
        // NFT合约地址     
        address nftAddress;
        // NFT ID
        uint256 nftId;
        // 拍卖是否结束
        bool ended;
        // 参与拍卖的资产类型 0x 地址表示eth，其他地址表示erc20
        address tokenAddress;
    }
    // 存储所有拍卖id
    uint256[] private _auctionIdList;
    // 存储所有的拍卖
    mapping(uint256 auctionId => Auction) private _auctions;
    // 下一个拍卖ID
    uint256 private _nextAuctionId;
    // 价格预言机地址映射
    mapping(address => AggregatorV3Interface) private _priceFeeds;

    // 记录拍卖创建事件
    event AuctionCreated(uint256 indexed auctionId, address indexed seller, address nftAddress, uint256 indexed tokenId);

    // 记录拍卖结束事件
    event AuctionEnded(uint256 indexed auctionId, address indexed seller, address nftAddress, 
    uint256 indexed tokenId);

    // 价格源更新事件，方便链下追踪
    event PriceFeedUpdated(address indexed tokenAddress, address indexed feedAddress);

    // 初始化函数，设置合约拥有者
    function initialize() initializer public {
      __Ownable_init(msg.sender);
    }

    /**
     * 设置价格预言机地址（计价资产应该是USD，例如ETH/USD，APE/USD）
     * 只有合约拥有者可以调用此函数，合约拥有者应该保证价格预言机的正确性和可靠性。
     * @param tokenAddress 代币地址
     * @param _priceFeed 预言机地址
     */
    function setPriceFeed(address tokenAddress, address _priceFeed) public onlyOwner {
        // 零地址检查，防止手误
        require(_priceFeed != address(0), "Invalid feed address");
        // 设置价格预言机
        _priceFeeds[tokenAddress] = AggregatorV3Interface(_priceFeed);
        // 价格源更新事件
        emit PriceFeedUpdated(tokenAddress, _priceFeed);
    }

    // 授权升级函数，只有合约拥有者可以升级合约
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /**
     * 创建拍卖：允许用户将 NFT 上架拍卖。
     * @param duration 持续时长(秒)
     * @param startPrice 起拍价
     * @param nftAddress NFT合约地址
     * @param tokenId NFT Token ID
     */
    function createAuction(
        uint256 duration, uint256 startPrice,
        address nftAddress, uint256 tokenId
    ) public {
        // 检查参数
        require(duration >= 10, "Duration must be greater than 10s");
        require(startPrice > 0, "Start price must be greater than 0");

        // 转移NFT到合约
        IERC721(nftAddress).safeTransferFrom(msg.sender, address(this),  tokenId);

        // 创建拍卖
        _auctions[_nextAuctionId] = Auction({
            seller: msg.sender,
            duration: duration,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            startPrice: startPrice,
            highestBidder: address(0),
            highestBid: 0,
            nftAddress: nftAddress,
            nftId: tokenId,
            ended: false,
            tokenAddress: address(0)
        });
        _auctionIdList.push(_nextAuctionId);
        emit AuctionCreated(_nextAuctionId, msg.sender, nftAddress, tokenId);
        _nextAuctionId++;
    }

    /**
     * 出价：允许用户对正在进行的拍卖出价。允许用户以 ERC20 或以太坊出价。
     * @param auctionId 拍卖ID
     * @param tokenAddress 资产地址 0x表示eth，其他地址表示erc20
     * @param tokenAmount 出价金额
     */
    function placeBid(uint256 auctionId, address tokenAddress, uint256 tokenAmount) external payable {
        Auction storage auction = _auctions[auctionId];
        // 判断当前拍卖是否结束
        require(
            !auction.ended &&
                auction.startTime + auction.duration > block.timestamp,
            "Auction has ended"
        );

        // 同一尺度的货币价值
        uint256 payValue;

        if (tokenAddress == address(0)) {
            // ETH
            tokenAmount = msg.value;
            tokenAddress = address(0);
        }
        payValue = tokenAmount * uint256(getChainlinkDataFeedLatestAnswer(tokenAddress));

        uint256 startPriceValue = auction.startPrice *
        uint256(getChainlinkDataFeedLatestAnswer(auction.tokenAddress));

        uint256 highestBidValue = auction.highestBid *
        uint256(getChainlinkDataFeedLatestAnswer(auction.tokenAddress));

        require(
            payValue >= startPriceValue && payValue > highestBidValue,
            "Bid must be higher than the current highest bid"
        );

        // 转移ERC20到合约
        if (tokenAddress != address(0)) {
            IERC20(tokenAddress).transferFrom(msg.sender, address(this), tokenAmount);
        }

        // 退还前最高价
        if (auction.highestBid > 0) {
            if (auction.tokenAddress == address(0)) {
                payable(auction.highestBidder).transfer(auction.highestBid);
            } else {
                // 退回之前的ERC20
                IERC20(auction.tokenAddress).transfer(
                    auction.highestBidder,
                    auction.highestBid
                );
            }
        }

        auction.tokenAddress = tokenAddress;
        auction.highestBid = tokenAmount;
        auction.highestBidder = msg.sender;
    }

    modifier auctionOwnerOnly(uint256 auctionID) {
        require(
            msg.sender == _auctions[auctionID].seller,
            "Only auction owner can call this function"
        );
        _;
    }

    /**
     * 结束拍卖：允许任何人在拍卖结束后调用此函数以完成拍卖过程。
     * @param auctionID 拍卖ID
     */
    function endAuction(uint256 auctionID) external auctionOwnerOnly(auctionID){
        Auction storage auction = _auctions[auctionID];
        // 判断当前拍卖是否结束
        require(
            !auction.ended &&
                (auction.startTime + auction.duration) <= block.timestamp,
            "Auction has not ended"
        );

        // 转移NFT到最高出价者
        IERC721(auction.nftAddress).safeTransferFrom(
            address(this),
            auction.highestBidder,
            auction.nftId
        );
        // 转移资金给卖家
        if (auction.tokenAddress == address(0)) {
            payable(auction.seller).transfer(auction.highestBid);
        } else {
            IERC20(auction.tokenAddress).transfer(
                auction.seller,
                auction.highestBid
            );
        }
        // 标记拍卖结束
        auction.ended = true;
        // 记录拍卖结束事件
        emit AuctionEnded(auctionID, auction.seller, auction.nftAddress, auction.nftId);
    }

    /**
     * 处理接收 ERC721 的回调函数，确保合约能够接收 NFT。
     */
    function onERC721Received(address operator, address from,uint256 tokenId, bytes calldata data) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * 获取 Chainlink 价格预言机的最新价格数据。
     * @param  tokenAddress 代币地址
     * @return answer 最新价格
     */
    function getChainlinkDataFeedLatestAnswer( address tokenAddress) public view returns (int) {
        AggregatorV3Interface priceFeed = _priceFeeds[tokenAddress];
        // prettier-ignore
        (
            /* uint80 roundId */,
            int256 answer,
            /*uint256 startedAt*/,
            /*uint256 updatedAt*/,
            /*uint80 answeredInRound*/
        ) = priceFeed.latestRoundData();
        return answer;
    }

    /**
     * 获取拍卖信息
     * @param auctionId 拍卖ID 
     */
    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return _auctions[auctionId];
    }

    /**
     * 获取所有拍卖ID
     */
    function getAuctionIds() external view returns (uint256[] memory) {
        return _auctionIdList;
    }
}
