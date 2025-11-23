// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

contract MyERC20Token {
    // 存储账户余额
    mapping(address account => uint256) private _balances;
    // 存储授权信息
    mapping(address account => mapping(address spender => uint256)) private _allowances;
    // token总量
    uint256 private _totalSupply;

    string private _name = "FaceToken";
    string private _symbol = "FTK";

    address private _contractOwner; // 合约拥有者

    // eip-6093
    error ERC20InvalidSender(address sender);
    // eip-6093
    error ERC20InvalidReceiver(address receiver);
    // eip-6093
    error ERC20InsufficientBalance(
        address sender,
        uint256 balance,
        uint256 needed
    );
    // eip-6093
    error ERC20InvalidApprover(address approver);
    // eip-6093
    error ERC20InvalidSpender(address spender);
    // eip-6093
    error ERC20InsufficientAllowance(
        address spender,
        uint256 allowance,
        uint256 needed
    );

    event Transfer(address indexed _from, address indexed _to, uint256 _value);

    event Approval(
        address indexed _owner,
        address indexed _spender,
        uint256 _value
    );

    constructor(){
        _contractOwner = msg.sender;
    }

    /**
     * Returns the name of the token
     */
    function name() public view returns (string memory){
        return _name;
    }

    /**
     * Returns the symbol of the token
     */
    function symbol() public view returns (string memory){
        return _symbol;
    }

    /**
     * Returns the total token supply.
     */
    function totalSupply() public view returns (uint256){
        return _totalSupply;
    }

    /**
     * Returns the number of decimals the token uses
     */
    function decimals() public view returns (uint8){
        return 18;
    }

    /**
     * 修饰器
     */
    modifier onlyOwner() {
        require(msg.sender == _contractOwner, "Only owner can call this function");
        _;
    }

    /**
     * 允许合约所有者增发代币
     * @param _to 发放地址
     * @param _value 增发代币数量
     */
    function mint(address _to, uint256 _value) public onlyOwner{
        if (_to == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(address(0), _to, _value);
    }

    /**
     * 查询账户余额
     * @param _owner 账户
     */
    function balanceOf(address _owner) public view returns (uint256 balance) {
        return _balances[_owner];
    }

    /**
     * 转账
     * @param _to 转入地址
     * @param _value 转账金额
     */
    function transfer(
        address _to,
        uint256 _value
    ) public returns (bool success) {
        if (msg.sender == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        if (_to == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(msg.sender, _to, _value);
        return true;
    }

    /**
     * 授权。用户（owner）允许另一个地址（spender）代他花钱
     * @param _spender 代扣账户
     * @param _value 授权额度
     */
    function approve(
        address _spender,
        uint256 _value
    ) public returns (bool success) {
        if (msg.sender == address(0)) {
            revert ERC20InvalidApprover(address(0));
        }
        if (_spender == address(0)) {
            revert ERC20InvalidSpender(address(0));
        }
        _allowances[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    /**
     * Transfers _value amount of tokens from address _from to address _to
     * @param _from from address
     * @param _to to address
     * @param _value amount of tokens
     */
    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) public returns (bool success) {
        address spender = msg.sender;
        uint256 currentAllowance = allowance(_from, spender);
        if (currentAllowance < type(uint256).max) {
            if (currentAllowance < _value) {
                revert ERC20InsufficientAllowance(
                    spender,
                    currentAllowance,
                    _value
                );
            }
            unchecked {
                if (_from == address(0)) {
                    revert ERC20InvalidApprover(address(0));
                }
                if (spender == address(0)) {
                    revert ERC20InvalidSpender(address(0));
                }
                _allowances[_from][spender] = currentAllowance - _value;
            }
        }

        if (_from == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        if (_to == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(_from, _to, _value);
        return true;
    }

    /**
     * 返回被授权者（_spender）还能代持有者（_owner）花费的剩余额度
     * @param _owner 持有者
     * @param _spender 代扣账户
     */
    function allowance(
        address _owner,
        address _spender
    ) public view returns (uint256 remaining) {
        return _allowances[_owner][_spender];
    }

    function _update(address from, address to, uint256 value) internal {
        if (from == address(0)) {
            // Overflow check required: The rest of the code assumes that totalSupply never overflows
            _totalSupply += value;
        } else {
            uint256 fromBalance = _balances[from];
            if (fromBalance < value) {
                revert ERC20InsufficientBalance(from, fromBalance, value);
            }
            unchecked {
                // Overflow not possible: value <= fromBalance <= totalSupply.
                _balances[from] = fromBalance - value;
            }
        }

        if (to == address(0)) {
            unchecked {
                // Overflow not possible: value <= totalSupply or value <= fromBalance <= totalSupply.
                _totalSupply -= value;
            }
        } else {
            unchecked {
                // Overflow not possible: balance + value is at most totalSupply, which we know fits into a uint256.
                _balances[to] += value;
            }
        }

        emit Transfer(from, to, value);
    }
}
