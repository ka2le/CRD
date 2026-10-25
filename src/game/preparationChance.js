// Exact physical-combination arithmetic for bounded draw integration.
export function chooseBig(n,k){
  if(k<0||k>n)return 0n
  k=Math.min(k,n-k);let v=1n
  for(let j=1;j<=k;j++)v=v*BigInt(n-j+1)/BigInt(j)
  return v
}
export function unrankCombination(n,k,rank){
  if(rank<0n||rank>=chooseBig(n,k))throw Error('Combination rank outside range')
  const result=[];let next=0
  for(let left=k;left>0;left--){
    for(let i=next;i<=n-left;i++){
      const count=chooseBig(n-i-1,left-1)
      if(rank<count){result.push(i);next=i+1;break}
      rank-=count
    }
  }
  return result
}
